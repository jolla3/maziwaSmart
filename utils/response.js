// utils/response.js
module.exports = function (app) {
  app.use((req, res, next) => {
    res.success = (data = {}, message = "OK", status = 200) => {
      return res.status(status).json({
        success: true,
        message,
        data,
      });
    };

    res.error = (message = "Something went wrong", status = 500, error = null) => {
      const payload = { success: false, message };
      if (process.env.NODE_ENV !== "production" && error)
        payload.error = error?.toString();
      return res.status(status).json(payload);
    };

    next();
  });
};
