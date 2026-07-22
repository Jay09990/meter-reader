"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var ga1, ga2, customer1, customer2, device1, device2, readingsData, now, i, readingDate, variance, i, readingDate, variance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("Cleaning up existing data...");
                    return [4 /*yield*/, prisma.alarm.deleteMany()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, prisma.reading.deleteMany()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, prisma.device.deleteMany()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, prisma.customer.deleteMany()];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, prisma.geographicalArea.deleteMany()];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, prisma.alarmSettings.deleteMany()];
                case 6:
                    _a.sent();
                    console.log("Creating AlarmSettings...");
                    return [4 /*yield*/, prisma.alarmSettings.create({
                            data: {
                                id: "singleton",
                                gasDeviationWindowDays: 7,
                                gasDeviationPercent: 20,
                            }
                        })];
                case 7:
                    _a.sent();
                    console.log("Creating Geographical Areas...");
                    return [4 /*yield*/, prisma.geographicalArea.create({
                            data: {
                                name: "Pune City GA",
                                code: "PUNE-01",
                            }
                        })];
                case 8:
                    ga1 = _a.sent();
                    return [4 /*yield*/, prisma.geographicalArea.create({
                            data: {
                                name: "Mumbai Metro GA",
                                code: "BOM-01",
                            }
                        })];
                case 9:
                    ga2 = _a.sent();
                    console.log("Creating Customers...");
                    return [4 /*yield*/, prisma.customer.create({
                            data: {
                                name: "Acme Industrial Ltd",
                                category: "INDUSTRIAL",
                                address: "123 Factory Road, Pune",
                                gaId: ga1.id,
                            }
                        })];
                case 10:
                    customer1 = _a.sent();
                    return [4 /*yield*/, prisma.customer.create({
                            data: {
                                name: "Central Mall",
                                category: "COMMERCIAL",
                                address: "Main Square, Mumbai",
                                gaId: ga2.id,
                            }
                        })];
                case 11:
                    customer2 = _a.sent();
                    console.log("Creating dummy devices...");
                    return [4 /*yield*/, prisma.device.create({
                            data: {
                                deviceSerialNo: "DEV-1001",
                                meterSerialNo: "MET-5501",
                                customerId: customer1.id,
                                latitude: 18.5204,
                                longitude: 73.8567,
                                lastSeenAt: new Date(),
                            },
                        })];
                case 12:
                    device1 = _a.sent();
                    return [4 /*yield*/, prisma.device.create({
                            data: {
                                deviceSerialNo: "DEV-1002",
                                meterSerialNo: "MET-5502",
                                customerId: customer2.id,
                                latitude: 19.0760,
                                longitude: 72.8777,
                                lastSeenAt: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2), // Stale device (2 days ago)
                            },
                        })];
                case 13:
                    device2 = _a.sent();
                    console.log("Creating dummy readings (past 7 days)...");
                    readingsData = [];
                    now = new Date();
                    // Generate 7 days of data for Device 1
                    for (i = 6; i >= 0; i--) {
                        readingDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                        variance = Math.random() * 50 - 25;
                        readingsData.push({
                            deviceId: device1.id,
                            readingDate: readingDate,
                            correctedVolumeVb: 1500.0 + (6 - i) * 100 + variance,
                            uncorrectedVolumeVm: 1480.0 + (6 - i) * 98 + variance,
                            gasPressure: 2.5 + Math.random() * 0.2,
                            gasTemperature: 15.0 + Math.random() * 2,
                            batteryLevel: 85 - i * 0.5,
                            currentFlowRate: 15 + Math.random() * 2,
                            rawPayload: { source: "dummy_seed" },
                        });
                    }
                    // Generate 7 days of data for Device 2 (but stop 2 days ago to simulate stale status)
                    for (i = 8; i >= 2; i--) {
                        readingDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                        variance = Math.random() * 30 - 15;
                        readingsData.push({
                            deviceId: device2.id,
                            readingDate: readingDate,
                            correctedVolumeVb: 1200.0 + (8 - i) * 80 + variance,
                            uncorrectedVolumeVm: 1180.0 + (8 - i) * 78 + variance,
                            gasPressure: 2.1 + Math.random() * 0.15,
                            gasTemperature: 12.0 + Math.random() * 1.5,
                            batteryLevel: 42 - i * 0.2,
                            currentFlowRate: 12 + Math.random() * 1.5,
                            rawPayload: { source: "dummy_seed" },
                        });
                    }
                    return [4 /*yield*/, prisma.reading.createMany({
                            data: readingsData
                        })];
                case 14:
                    _a.sent();
                    console.log("Creating dummy alarms...");
                    return [4 /*yield*/, prisma.alarm.create({
                            data: {
                                deviceId: device1.id,
                                type: "GAS_OUT_OF_RANGE",
                                severity: "WARNING",
                                cause: "Pressure exceeded maximum threshold",
                                gasValue: 5.8,
                                forDate: new Date(),
                                status: "OPEN",
                            },
                        })];
                case 15:
                    _a.sent();
                    return [4 /*yield*/, prisma.alarm.create({
                            data: {
                                deviceId: device2.id,
                                type: "MISSING_DATA",
                                severity: "CRITICAL",
                                cause: "No communication for 48 hours",
                                forDate: new Date(),
                                status: "OPEN",
                            },
                        })];
                case 16:
                    _a.sent();
                    console.log("Seeding finished.");
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
