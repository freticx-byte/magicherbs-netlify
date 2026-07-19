import asyncio
import json
import logging
import os
import hmac
import hashlib
from urllib.parse import parse_qsl

from dotenv import load_dotenv
load_dotenv()  # читает .env в текущей директории — удобно для локального запуска в PyCharm

import aiohttp
from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo,
    Message, CallbackQuery, FSInputFile
)
from aiogram.filters import Command
from aiogram import F
from pathlib import Path

# ===================== ПАПКА С ФОТО ДЛЯ МЕНЮ =====================
# Положите сюда картинки (jpg/png) с такими именами — бот подхватит их автоматически.
# Если файла нет — раздел просто покажется без фото, ошибки не будет.
PHOTOS_DIR = Path(__file__).parent / "Photos"
PHOTO_MAIN_MENU = "main_menu.jpg"
PHOTO_FAQ = "faq.jpg"
PHOTO_DELIVERY = "delivery.jpg"
PHOTO_ABOUT = "about.jpg"
PHOTO_CONTACTS = "contacts.jpg"


def get_photo(filename: str):
    path = PHOTOS_DIR / filename
    if path.exists():
        return FSInputFile(str(path))
    return None

# ===================== ТЕКСТЫ ГЛАВНОГО МЕНЮ =====================
FAQ_TEXT = (
    "❓ *Частые вопросы*\n\n"
    "*Товар точно натуральный?*\n"
    "Да. Мы используем только дикорастущее сырьё Сибири и Алтая — никакого искусственно "
    "выращенного или китайского сырья. Никакого пластика — только стеклянная тара.\n\n"
    "*В чём уникальность продукции?*\n"
    "Уникальная вакуумная низкотемпературная технология экстракции — она сохраняет "
    "полезные вещества растений, без выпаривания в «кастрюлях» и без вредных реагентов "
    "или консервантов. Эффективность экстракции — до 99%.\n\n"
    "*Продукция сертифицирована?*\n"
    "Да, качество контролируется на всех этапах и проверяется в лабораториях. "
    "Сертификаты — на сайте, раздел «Протоколы».\n\n"
    "*Продаётся ли продукция на маркетплейсах?*\n"
    "Нет — мы держим эксклюзивное качество и объёмы и принципиально не продаём "
    "продукцию на маркетплейсах и в массмаркетах.\n\n"
    "*Как отследить заказ?*\n"
    "Трек-номер придёт на e-mail, указанный при оформлении заказа.\n\n"
    "Не нашли ответ? Напишите нам — кнопка «Контакты» ниже."
)

DELIVERY_TEXT = (
    "🚚 *Доставка и оплата*\n\n"
    "*Способы доставки:*\n"
    "• Стандартная — бесплатно, 3–5 рабочих дней\n"
    "• Экспресс — 500 ₽, 1–2 рабочих дня\n\n"
    "🎁 На заказы от 10 000 ₽ — скидка и бесплатная доставка.\n\n"
    "*Способы оплаты:*\n"
    "• OzonPay\n"
    "• CloudPayments (карты Visa/Mastercard/МИР)\n"
    "• Robokassa (СБП, карты, эл. кошельки)\n"
    "• ЮKassa (карта, ЮMoney, SberPay)\n\n"
    "Подробности — на сайте, раздел «Доставка и оплата»."
)

ABOUT_TEXT = (
    "🌲 *О MagicHerbs*\n\n"
    "MagicHerbs — семейный бренд, часть научно-производственного комплекса по "
    "изготовлению биоэкстрактов с более чем 20-летней историей на рынке.\n\n"
    "Всё сырьё — только дикорастущие травы и растения, которые мы собираем в "
    "экологических заповедниках Сибири, от Горного Алтая до севера Томской области. "
    "Производство находится прямо в месте произрастания сырья, что сохраняет "
    "высокую концентрацию полезных веществ.\n\n"
    "*Наша миссия* — сохранить человечество в здоровом, не видоизменённом виде: "
    "натуральные концентраты из дикорастущего сырья вместо синтетических препаратов.\n\n"
    "Подробнее — в разделах «О нас» и «Миссия» на mherbs.ru"
)

CONTACTS_TEXT = (
    "📞 *Контакты*\n\n"
    "📍 Томск\n"
    "☎️ +7 900 922 4496\n"
    "✉️ magicherbs4you@yandex.ru\n\n"
    "VK: vk.com/mherbs\n"
    "Telegram: t.me/yegorogurtsov\n"
    "WhatsApp: wa.me/79009224496\n\n"
    "Сайт: mherbs.ru"
)


def main_menu_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🛒 Открыть каталог", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton(text="❓ Частые вопросы", callback_data="menu_faq")],
            [InlineKeyboardButton(text="🚚 Доставка и оплата", callback_data="menu_delivery")],
            [InlineKeyboardButton(text="🌲 О бренде", callback_data="menu_about")],
            [InlineKeyboardButton(text="📞 Контакты", callback_data="menu_contacts")],
        ]
    )


def back_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="⬅️ Назад в меню", callback_data="menu_back")]]
    )

# ===================== НАСТРОЙКИ (из переменных окружения) =====================
BOT_TOKEN = os.environ["BOT_TOKEN"]
ADMIN_ID = int(os.environ["ADMIN_ID"])

OZON_CLIENT_ID = os.environ["OZON_CLIENT_ID"]
OZON_API_KEY = os.environ["OZON_API_KEY"]

WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://magicherbsss.netlify.app/")
ORDER_SHARED_SECRET = os.environ["ORDER_SHARED_SECRET"]
PORT = int(os.environ.get("PORT", 8080))

# ===================== ИНИЦИАЛИЗАЦИЯ =====================
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("bot")

bot = Bot(token=BOT_TOKEN, request_timeout=120)
dp = Dispatcher()

orders_db = {}


def catalog_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🛒 Открыть каталог", web_app=WebAppInfo(url=WEBAPP_URL))]
        ]
    )


def confirm_keyboard(order_id):
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Подтвердить оплату", callback_data=f"confirm_{order_id}")]
        ]
    )


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
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                data = await resp.json()
                if resp.status == 200:
                    return data.get("payment_url")
                log.warning("Ozon error: %s", data)
                return None
    except Exception:
        log.exception("Ozon exception")
        return None


# ===================== ПРОВЕРКА ПОДЛИННОСТИ TELEGRAM initData =====================
def verify_telegram_init_data(init_data: str, bot_token: str):
    try:
        parsed = dict(parse_qsl(init_data, strict_parsing=True))
        received_hash = parsed.pop("hash", None)
        if not received_hash:
            return None

        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            return None
        return parsed
    except Exception:
        return None


# ===================== CORS =====================
# Разрешаем запросы именно с домена сайта на Netlify (WEBAPP_URL), иначе браузер
# заблокирует fetch() с сайта на другой домен (бот на Bothost) как cross-origin.
CORS_ORIGIN = WEBAPP_URL.rstrip("/")

@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        resp = web.Response()
    else:
        resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
    resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Order-Secret"
    return resp


# ===================== HTTP ЭНДПОИНТ ДЛЯ ЗАКАЗОВ С САЙТА =====================
async def handle_order(request: web.Request):
    if request.headers.get("X-Order-Secret") != ORDER_SHARED_SECRET:
        return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)

    init_data = body.get("init_data")
    verified = verify_telegram_init_data(init_data, BOT_TOKEN) if init_data else None
    if not verified:
        return web.json_response({"ok": False, "error": "invalid telegram init_data"}, status=401)

    user_data = json.loads(verified.get("user", "{}"))
    user_id = user_data.get("id")
    if not user_id:
        return web.json_response({"ok": False, "error": "no user id"}, status=400)

    order_id = body.get("order_id")
    amount = body.get("amount")
    customer = body.get("customer", {})
    items = body.get("items", [])

    if not order_id or not amount:
        return web.json_response({"ok": False, "error": "missing order_id/amount"}, status=400)

    orders_db[order_id] = {
        "user_id": user_id,
        "amount": amount,
        "status": "pending",
        "customer": customer,
        "items": items,
    }

    payment_url = await create_ozon_payment(amount, order_id, user_id)

    if payment_url:
        try:
            await bot.send_message(
                user_id,
                f"💳 *Оплатите заказ*\n\n"
                f"Сумма: *{amount} ₽*\n"
                f"Номер заказа: `{order_id}`\n\n"
                f"🔗 [Перейти к оплате]({payment_url})\n\n"
                f"✅ После оплаты нажмите кнопку ниже.",
                parse_mode="Markdown",
                reply_markup=confirm_keyboard(order_id),
            )
            await bot.send_message(ADMIN_ID, f"🆕 Новый заказ {order_id} на {amount} ₽. Ожидает оплаты.")
        except Exception:
            log.exception("Не удалось отправить сообщение пользователю")
            return web.json_response({"ok": False, "error": "cannot message user"}, status=502)

        return web.json_response({"ok": True, "payment_url": payment_url})
    else:
        return web.json_response({"ok": False, "error": "ozon payment creation failed"}, status=502)


async def handle_health(request: web.Request):
    return web.json_response({"ok": True})


# ===================== ХЕНДЛЕРЫ БОТА =====================
@dp.callback_query(lambda c: c.data and c.data.startswith("confirm_"))
async def confirm_payment(callback: CallbackQuery):
    order_id = callback.data.replace("confirm_", "")
    order = orders_db.get(order_id)
    if not order:
        await callback.answer("Заказ не найден", show_alert=True)
        return
    order["status"] = "paid"
    await bot.send_message(callback.from_user.id, "✅ Спасибо! Ваш заказ оплачен. Мы свяжемся с вами.")
    await bot.send_message(ADMIN_ID, f"✅ Заказ {order_id} ОПЛАЧЕН!")
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Оплата подтверждена!")


async def show_menu_section(callback: CallbackQuery, text: str, photo_filename: str, keyboard: InlineKeyboardMarkup):
    try:
        await callback.message.delete()
    except Exception:
        pass
    photo = get_photo(photo_filename)
    if photo:
        await bot.send_photo(callback.from_user.id, photo, caption=text, parse_mode="Markdown", reply_markup=keyboard)
    else:
        await bot.send_message(callback.from_user.id, text, parse_mode="Markdown", reply_markup=keyboard)
    await callback.answer()


@dp.callback_query(F.data == "menu_faq")
async def menu_faq_handler(callback: CallbackQuery):
    await show_menu_section(callback, FAQ_TEXT, PHOTO_FAQ, back_keyboard())


@dp.callback_query(F.data == "menu_delivery")
async def menu_delivery_handler(callback: CallbackQuery):
    await show_menu_section(callback, DELIVERY_TEXT, PHOTO_DELIVERY, back_keyboard())


@dp.callback_query(F.data == "menu_about")
async def menu_about_handler(callback: CallbackQuery):
    await show_menu_section(callback, ABOUT_TEXT, PHOTO_ABOUT, back_keyboard())


@dp.callback_query(F.data == "menu_contacts")
async def menu_contacts_handler(callback: CallbackQuery):
    await show_menu_section(callback, CONTACTS_TEXT, PHOTO_CONTACTS, back_keyboard())


@dp.callback_query(F.data == "menu_back")
async def menu_back_handler(callback: CallbackQuery):
    main_text = "🌿 *MagicHerbs*\n\nНатуральные нутрицевтики из Сибири.\n\nВыберите раздел:"
    await show_menu_section(callback, main_text, PHOTO_MAIN_MENU, main_menu_keyboard())


@dp.message(Command("start"))
async def start_command(message: Message):
    text = "🌿 *MagicHerbs*\n\nНатуральные нутрицевтики из Сибири.\n\nВыберите раздел:"
    photo = get_photo(PHOTO_MAIN_MENU)
    if photo:
        await message.answer_photo(photo, caption=text, parse_mode="Markdown", reply_markup=main_menu_keyboard())
    else:
        await message.answer(text, parse_mode="Markdown", reply_markup=main_menu_keyboard())


# ===================== ЗАПУСК: POLLING + HTTP СЕРВЕР ОДНОВРЕМЕННО =====================
async def start_web_server():
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_post("/webhook/order", handle_order)
    app.router.add_options("/webhook/order", lambda r: web.Response())  # preflight
    app.router.add_get("/health", handle_health)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    log.info(f"HTTP сервер заказов запущен на порту {PORT}")


async def main():
    await start_web_server()
    log.info(f"🖼 Ищу фото в папке: {PHOTOS_DIR.resolve()}")
    log.info(f"🖼 Папка существует: {PHOTOS_DIR.exists()}")
    if PHOTOS_DIR.exists():
        log.info(f"🖼 Файлы в папке: {[f.name for f in PHOTOS_DIR.iterdir()]}")
    log.info(f"🖼 main_menu.jpg найден: {(PHOTOS_DIR / PHOTO_MAIN_MENU).exists()}")
    log.info("🚀 Бот запущен...")
    await dp.start_polling(bot, skip_updates=True)


if __name__ == "__main__":
    asyncio.run(main())