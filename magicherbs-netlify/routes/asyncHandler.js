// routes/asyncHandler.js
// Express 4 не ловит отклонённые промисы автоматически — оборачиваем
// каждый async-хендлер, чтобы ошибки уходили в next(err) и обрабатывались
// централизованным error-хендлером в app.js.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
