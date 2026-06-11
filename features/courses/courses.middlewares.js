/*
Example:

---------------

const BookService = require("./books.service");

const isAuthor = async (req, res, next) => {
    try {
        const book = await BookService.findById(req.params.id);
        if (book && book.author.toString() === req.user._id) {
            next();
        } else {
            res.status(403).json({
                status: "error",
                message: "Forbidden, only author can perform this action",
            });
        }
    } catch (err) {
        res.status(500).json({
            status: "error",
            message: "Internal Server Error",
        });
    }
};
*/