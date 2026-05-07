"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dealer_1 = require("../controller/dealer");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
router.post("/", authMiddleware_1.authenticateToken, dealer_1.createDealer);
router.get("/", authMiddleware_1.authenticateToken, dealer_1.getDealers);
router.get("/:id", authMiddleware_1.authenticateToken, dealer_1.getDealerById);
router.put("/:id", authMiddleware_1.authenticateToken, dealer_1.updateDealer);
router.delete("/:id", authMiddleware_1.authenticateToken, dealer_1.deleteDealer);
exports.default = router;
