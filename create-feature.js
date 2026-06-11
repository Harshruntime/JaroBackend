const fs = require("fs-extra");
const path = require("path");

const featureName = process.argv[2];

if (!featureName) {
    console.error("Please provide a feature name.");
    process.exit(1);
}

const featurePath = path.join(__dirname, "features", featureName);

if (fs.existsSync(featurePath)) {
    console.error(`Feature "${featureName}" already exists.`);
    process.exit(1);
}

// SCHEMA PAGE TEMPLATE
const schema = `
const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const ${featureName}Schema = new mongoose.Schema({
    name: {
        type: String,
        required: false,
    },
    description: {
        type: String,
        required: false,
    },
}, {
    timestamps: true
});

/* Middleware to automatically populate relational fields

${featureName}Schema.pre('find', function(next) {
    this.populate('key1');
    next();
});

${featureName}Schema.pre('findOne', function(next) {
    this.populate(['key1', 'key2']);
    next();
});
*/

${featureName}Schema.plugin(mongoosePaginate);
module.exports = ${featureName}Schema;`;

// MODELS PAGE TEMPLATE
const model = `
const mongoose = require("mongoose");

const ${featureName}Schema = require("./${featureName}.schema");

module.exports = mongoose.model(
    '${featureName.charAt(0).toUpperCase() + featureName.slice(1)}',
    ${featureName}Schema
);`;

// SERVICE PAGE TEMPLATE
const service = `
const BaseService = require("../../utils/base.service");
const ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Model = require("./${featureName}.model");

class ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Service extends BaseService {
    constructor() {
        super(${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Model);
    }
}

module.exports = new ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Service();`;

// CONTROLLER PAGE TEMPLATE
const controller = `
const BaseController = require('../../utils/base.controller');
const ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Service = require('./${featureName}.service');

class ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Controller extends BaseController {
    constructor() {
        super(${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Service);
    }
}

module.exports = new ${featureName.charAt(0).toUpperCase() + featureName.slice(1)}Controller();`;

// ROUTES PAGE TEMPLATE
const routes = `
const express = require('express');
const ${featureName}Controller = require('./${featureName}.controller');

const router = express.Router();

router.get('/', ${featureName}Controller.getAll);
router.get('/:id', ${featureName}Controller.getOne);
router.post('/', ${featureName}Controller.create);
router.put('/:id', ${featureName}Controller.update);
router.delete('/:id', ${featureName}Controller.delete);
router.patch('/:id', ${featureName}Controller.update); // Using update for patch
router.post('/search', ${featureName}Controller.search);

module.exports = router;
`;

const middlewares = `
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
`;

const templates = {
    schema,
    model,
    service,
    controller,
    routes,
    middlewares,
};

fs.ensureDirSync(featurePath);

Object.entries(templates).forEach(([fileName, content]) => {
    const filePath = path.join(featurePath, `${featureName}.${fileName}.js`);
    fs.writeFileSync(filePath, content.trim());
});

console.log(`Feature "${featureName}" created successfully.`);
