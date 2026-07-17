import asyncio
import json
import time
import logging
from aiogram import Bot, Dispatcher, types
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.contrib.middlewares.logging import LoggingMiddleware
import aiohttp

# ===================== НАСТРОЙКИ =====================
BOT_TOKEN = "8349885692:AAHHmDlyxaMv6rOs8I5e7cMIPJ6iXn9MS8Y"
ADMIN_ID = 6495070440  # ЗАМЕНИ НА СВОЙ TELEGRAM ID

OZON_CLIENT_ID = "cp8Wi6oKOihW4Rs4W4Uq8XImfXOUHFE6"
OZON_API_KEY = "DLzy5KoaBReYOc2nA12aSrij2B9rtrbM"

# ===================== ИНИЦИАЛИЗАЦИЯ =====================
logging.basicConfig(level=logging.INFO)
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot)
dp.middleware.setup(LoggingMiddleware())

orders_db = {}


# ===================== ФУНКЦИИ БАЗЫ ДАННЫХ =====================
def save_order(order_info):
    orders_db[order_info["order_id"]] = order_info
    logging.info(f"Заказ сохранён: {order_info['order_id']}")


def update_order_status(order_id, status):
    if order_id in orders_db:
        orders_db[order_id]["status"] = status
        logging.info(f"Статус заказа {order_id} обновлён на {status}")


def get_order(order_id):
    return orders_db.get(order_id)


def get_user_id_by_order(order_id):
    order = get_order(order_id)
    return order.get("user_id") if order else None


# ===================== ФУНКЦИЯ СОЗДАНИЯ ПЛАТЕЖА =====================
async def create_ozon_payment(amount, order_id, user_id):
    url = "https://api.ozon.ru/v1/payments/create"
    headers = {
        "Client-Id": OZON_CLIENT_ID,
        "Api-Key": OZON_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "amount": amount,
        "currency": "RUB",
        "description": f"MagicHerbs — заказ #{order_id}",
        "order_id": order_id,
        "return_url": f"https://t.me/your_bot?start=payment_ok_{order_id}",
        "cancel_url": f"https://t.me/your_bot?start=payment_cancel_{order_id}"
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                data = await resp.json()
                logging.info(f"Ozon API ответ: {data}")
                if resp.status == 200:
                    return data.get("payment_url")
                else:
                    logging.error(f"Ozon ошибка: {data}")
                    return None
    except Exception as e:
        logging.error(f"Ошибка при создании платежа: {e}")
        return None


# ===================== КЛАВИАТУРА =====================
def payment_confirmation_keyboard(order_id):
    keyboard = InlineKeyboardMarkup(row_width=1)
    keyboard.add(
        InlineKeyboardButton("✅ Подтвердить оплату", callback_data=f"confirm_payment_{order_id}")
    )
    return keyboard


# ===================== ОБРАБОТЧИК MINI APP =====================
@dp.message_handler(content_types=types.ContentType.WEB_APP_DATA)
async def handle_webapp_data(message: types.Message):
    try:
        data = json.loads(message.web_app_data.data)
        logging.info(f"Получены данные из Mini App: {data}")

        if data.get("action") != "create_payment":
            return

        user_id = message.from_user.id
        order_id = data.get("order_id")
        amount = data.get("amount")
        customer = data.get("customer", {})
        items = data.get("items", {})
        delivery = data.get("delivery", "standard")
        payment_method = data.get("payment", "ozonpay")

        order_info = {
            "order_id": order_id,
            "user_id": user_id,
            "amount": amount,
            "status": "pending",
            "customer": customer,
            "items": items,
            "delivery": delivery,
            "payment_method": payment_method,
            "username": message.from_user.username,
            "first_name": message.from_user.first_name
        }
        save_order(order_info)

        payment_url = await create_ozon_payment(amount, order_id, user_id)

        if payment_url:
            await bot.send_message(
                user_id,
                f"💳 *Оплатите заказ*\n\n"
                f"Сумма: *{amount} руб.*\n"
                f"Номер заказа: `{order_id}`\n\n"
                f"🔗 [Перейти к оплате через Ozon Pay]({payment_url})\n\n"
                f"✅ После оплаты нажмите кнопку ниже.",
                parse_mode="Markdown",
                reply_markup=payment_confirmation_keyboard(order_id)
            )

            await bot.send_message(
                ADMIN_ID,
                f"🆕 *Новый заказ*\n"
                f"№: `{order_id}`\n"
                f"Сумма: {amount} руб.\n"
                f"Клиент: @{message.from_user.username or 'без юзернейма'}\n"
                f"Имя: {message.from_user.first_name}\n"
                f"Товаров: {len(items)} позиций\n"
                f"Статус: ожидает оплаты",
                parse_mode="Markdown"
            )
        else:
            await bot.send_message(
                user_id,
                "⚠️ Не удалось создать платёж. Пожалуйста, попробуйте позже.\n"
                "Или свяжитесь с нами напрямую."
            )

    except Exception as e:
        logging.error(f"Ошибка обработки WebAppData: {e}")
        await bot.send_message(
            message.from_user.id,
            "⚠️ Произошла ошибка при обработке заказа. Попробуйте ещё раз."
        )


# ===================== ПОДТВЕРЖДЕНИЕ ОПЛАТЫ =====================
@dp.callback_query_handler(lambda c: c.data and c.data.startswith("confirm_payment_"))
async def confirm_payment(callback_query: types.CallbackQuery):
    try:
        order_id = callback_query.data.replace("confirm_payment_", "")
        user_id = callback_query.from_user.id

        order = get_order(order_id)
        if not order:
            await callback_query.answer("Заказ не найден", show_alert=True)
            return

        update_order_status(order_id, "paid")

        await bot.send_message(
            user_id,
            "✅ *Спасибо за оплату!*\n\n"
            "Ваш заказ принят и передан в обработку.\n"
            "Мы свяжемся с вами для подтверждения доставки.",
            parse_mode="Markdown"
        )

        await bot.send_message(
            ADMIN_ID,
            f"✅ *Заказ #{order_id} ОПЛАЧЕН!*\n"
            f"Клиент: @{callback_query.from_user.username or 'без юзернейма'}\n"
            f"Сумма: {order.get('amount', 'неизвестно')} руб.",
            parse_mode="Markdown"
        )

        await callback_query.message.edit_reply_markup(reply_markup=None)
        await callback_query.answer("Оплата подтверждена!", show_alert=True)

    except Exception as e:
        logging.error(f"Ошибка подтверждения оплаты: {e}")
        await callback_query.answer("Произошла ошибка", show_alert=True)


# ===================== КОМАНДЫ =====================
@dp.message_handler(commands=['start'])
async def start_command(message: types.Message):
    await message.answer(
        "🌿 *Добро пожаловать в MagicHerbs!*\n\n"
        "Натуральные нутрицевтики из дикоросов Сибири.\n\n"
        "🛒 Откройте каталог, чтобы выбрать продукцию.",
        parse_mode="Markdown"
    )


@dp.message_handler(commands=['orders'])
async def orders_command(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        await message.answer("⛔ Нет доступа.")
        return

    if not orders_db:
        await message.answer("📭 Заказов нет.")
        return

    text = "📦 *Заказы*\n\n"
    for order_id, order in orders_db.items():
        status_emoji = "✅" if order.get("status") == "paid" else "⏳"
        text += f"{status_emoji} `{order_id}` — {order.get('amount', 0)} руб. ({order.get('status', 'pending')})\n"

    await message.answer(text, parse_mode="Markdown")


# ===================== ВЕБХУК ДЛЯ OZON (ОПЦИОНАЛЬНО) =====================
from aiohttp import web


async def ozon_webhook(request):
    data = await request.json()
    event = data.get("event")
    order_id = data.get("order_id")

    if event == "payment_succeeded":
        update_order_status(order_id, "paid")
        user_id = get_user_id_by_order(order_id)
        if user_id:
            await bot.send_message(user_id, "✅ Ваш заказ оплачен. Спасибо!")
        await bot.send_message(ADMIN_ID, f"✅ *Заказ #{order_id}* оплачен (автоматически)", parse_mode="Markdown")

    return web.Response(text="OK")


app = web.Application()
app.router.add_post("/webhook/ozon", ozon_webhook)

# ===================== ЗАПУСК =====================
if __name__ == '__main__':
    from aiogram import executor

    executor.start_polling(dp, skip_updates=True)