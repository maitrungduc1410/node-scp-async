"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = exports.ScpClient = void 0;
var events_1 = require("events");
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var ssh2_1 = require("ssh2");
var ScpClient = /** @class */ (function (_super) {
    __extends(ScpClient, _super);
    function ScpClient(options) {
        var _this = _super.call(this) || this;
        _this.sftpWrapper = null;
        _this.sshClient = null;
        var ssh = new ssh2_1.Client();
        ssh.on('connect', function () {
            _this.emit('connect');
        });
        ssh.on('ready', function () {
            ssh.sftp(function (err, sftp) {
                if (err) {
                    throw err;
                }
                // save for reuse
                _this.sftpWrapper = sftp;
                _this.emit('ready');
            });
        });
        ssh.on('error', function (err) {
            _this.emit('error', err);
        });
        ssh.on('end', function () {
            _this.emit('end');
        });
        ssh.on('close', function () {
            _this.emit('close');
        });
        ssh.on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish) {
            _this.emit('keyboard-interactive', name, instructions, instructionsLang, prompts, finish);
        });
        ssh.on('change password', function (message, language, done) {
            _this.emit('change password', message, language, done);
        });
        ssh.on('tcp connection', function (details, accept, reject) {
            _this.emit('tcp connection', details, accept, reject);
        });
        ssh.connect(options);
        _this.sshClient = ssh;
        return _this;
    }
    ScpClient.prototype.uploadFile = function (localPath, remotePath) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.sftpWrapper.fastPut(localPath, remotePath, function (err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    })];
            });
        });
    };
    ScpClient.prototype.downloadFile = function (remotePath, localPath) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.sftpWrapper.fastGet(remotePath, localPath, function (err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    })];
            });
        });
    };
    ScpClient.prototype.uploadDir = function (src, dest) {
        return __awaiter(this, void 0, void 0, function () {
            var isExist, dirEntries, _i, dirEntries_1, e, newSrc, newDst, newSrc, newDst, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 10, , 11]);
                        return [4 /*yield*/, this.exists(dest)];
                    case 1:
                        isExist = _a.sent();
                        if (!!isExist) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.mkdir(dest)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        dirEntries = fs_1.default.readdirSync(src, {
                            encoding: 'utf8',
                            withFileTypes: true,
                        });
                        _i = 0, dirEntries_1 = dirEntries;
                        _a.label = 4;
                    case 4:
                        if (!(_i < dirEntries_1.length)) return [3 /*break*/, 9];
                        e = dirEntries_1[_i];
                        if (!e.isDirectory()) return [3 /*break*/, 6];
                        newSrc = path_1.default.join(src, e.name);
                        newDst = path_1.default.join(dest, e.name);
                        return [4 /*yield*/, this.uploadDir(newSrc, newDst)];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 6:
                        if (!e.isFile()) return [3 /*break*/, 8];
                        newSrc = path_1.default.join(src, e.name);
                        newDst = path_1.default.join(dest, e.name);
                        return [4 /*yield*/, this.uploadFile(newSrc, newDst)
                            // this.client.emit('upload', {source: src, destination: dst})
                        ];
                    case 7:
                        _a.sent();
                        _a.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 4];
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        error_1 = _a.sent();
                        throw error_1;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    ScpClient.prototype.stat = function (remotePath) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.sftpWrapper.stat(remotePath, function (err, stats) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve(stats);
                            }
                        });
                    })];
            });
        });
    };
    ScpClient.prototype.mkdir = function (remotePath) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        _this.sftpWrapper.mkdir(remotePath, function (err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    })];
            });
        });
    };
    ScpClient.prototype.exists = function (remotePath) {
        return __awaiter(this, void 0, void 0, function () {
            var stats, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.stat(remotePath)];
                    case 1:
                        stats = _a.sent();
                        if (stats.isDirectory()) {
                            return [2 /*return*/, 'd'];
                        }
                        if (stats.isSymbolicLink()) {
                            return [2 /*return*/, 'l'];
                        }
                        if (stats.isFile()) {
                            return [2 /*return*/, '-'];
                        }
                        return [2 /*return*/, false];
                    case 2:
                        error_2 = _a.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    ScpClient.prototype.close = function () {
        if (this.sftpWrapper) {
            this.sftpWrapper.end();
            this.sftpWrapper = null;
        }
        if (this.sshClient) {
            this.sshClient.end();
            this.sshClient = null;
        }
    };
    return ScpClient;
}(events_1.EventEmitter));
exports.ScpClient = ScpClient;
function Client(options) {
    return __awaiter(this, void 0, void 0, function () {
        var client;
        return __generator(this, function (_a) {
            client = new ScpClient(options);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    client.on('ready', function () {
                        resolve(client);
                    });
                    client.on('error', function (err) {
                        reject(err);
                    });
                })];
        });
    });
}
exports.Client = Client;
module.exports = Client;
