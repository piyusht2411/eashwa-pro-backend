"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const miscellaneous_1 = require("../controller/miscellaneous");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Admin: list all miscellaneous entries + total
router.get("/", (0, authMiddleware_1.requireRole)("admin"), miscellaneous_1.getAllMiscellaneous);
// Admin: add a miscellaneous amount
router.post("/", (0, authMiddleware_1.requireRole)("admin"), miscellaneous_1.addMiscellaneous);
// Admin: delete a miscellaneous entry
router.delete("/:id", (0, authMiddleware_1.requireRole)("admin"), miscellaneous_1.deleteMiscellaneous);
exports.default = router;
