"use strict";
// ======================================================================
//
//   GNU GENERAL PUBLIC LICENSE
//   Version 3, 29 June 2007
//   copyright (c) 2021 Quentin Gruber
//
//   https://github.com/QuentinGruber/h1z1-server
//   https://www.npmjs.com/package/h1z1-server
//
//   Based on https://github.com/psemu/soe-network
// ======================================================================
var EventEmitter = require("events").EventEmitter, SOEProtocol = require("../../protocols/soeprotocol").SOEProtocol, SOEInputStream = require("./soeinputstream").SOEInputStream, SOEOutputStream = require("./soeoutputstream").SOEOutputStream, util = require("util"), dgram = require("dgram"), debug = require("debug")("SOEServer");
function SOEServerError(message) {
    this.name = this.constructor.name;
    this.message = message;
}
util.inherits(SOEServerError, Error);
function SOEServer(protocolName, serverPort, cryptoKey, compression, isGatewayServer) {
    if (isGatewayServer === void 0) { isGatewayServer = false; }
    EventEmitter.call(this);
    this._protocolName = protocolName;
    this._serverPort = serverPort;
    this._cryptoKey = cryptoKey;
    this._compression = compression;
    this._protocol = new SOEProtocol();
    this._udpLength = 512;
    this._useEncryption = true;
    this._isGatewayServer = isGatewayServer;
    var clients = (this._clients = {});
    var connection = (this._connection = dgram.createSocket("udp4"));
    var me = this;
    function handlePacket(client, packet) {
        var soePacket = packet === null || packet === void 0 ? void 0 : packet.soePacket;
        var result = soePacket === null || soePacket === void 0 ? void 0 : soePacket.result;
        if (result != null) {
            switch (soePacket.name) {
                case "SessionRequest":
                    debug("Received session request from " +
                        client.address +
                        ":" +
                        client.port);
                    client.sessionId = result.sessionId;
                    client.clientUdpLength = result.udpLength;
                    client.protocolName = result.protocol;
                    client.compression = me._compression;
                    client.serverUdpLength = me._udpLength;
                    client.crcSeed = me._crcSeed;
                    client.crcLength = me._crcLength;
                    if (me._isGatewayServer) {
                        client.inputStream.setEncryption(false);
                        client.outputStream.setEncryption(false);
                    }
                    else {
                        client.inputStream.setEncryption(me._useEncryption);
                        client.outputStream.setEncryption(me._useEncryption);
                    }
                    client.outputStream.setFragmentSize(client.clientUdpLength - 7);
                    me._sendPacket(client, "SessionReply", {
                        sessionId: client.sessionId,
                        crcSeed: client.crcSeed,
                        crcLength: client.crcLength,
                        compression: client.compression,
                        udpLength: client.serverUdpLength,
                    });
                    me.emit("session", null, client);
                    break;
                case "Disconnect":
                    debug("Received disconnect from client");
                    delete clients[client.address + ":" + client.port];
                    me.emit("disconnect", null, client);
                    break;
                case "MultiPacket":
                    var lastOutOfOrder = 0;
                    var channel = 0;
                    for (var i = 0; i < result.subPackets.length; i++) {
                        var subPacket = result.subPackets[i];
                        switch (subPacket.name) {
                            case "OutOfOrder":
                                if (subPacket.sequence > lastOutOfOrder) {
                                    lastOutOfOrder = subPacket.sequence;
                                }
                                break;
                            default:
                                handlePacket(client, {
                                    soePacket: subPacket,
                                });
                        }
                    }
                    if (lastOutOfOrder > 0) {
                        debug("Received multiple out-order-packet packet on channel " +
                            channel +
                            ", sequence " +
                            lastOutOfOrder);
                        client.outputStream.resendData(lastOutOfOrder);
                    }
                    break;
                case "Ping":
                    debug("Received ping from client");
                    me._sendPacket(client, "Ping", {
                        sessionId: client.sessionId,
                        crcSeed: client.crcSeed,
                        crcLength: client.crcLength,
                        compression: client.compression,
                        udpLength: client.serverUdpLength,
                    });
                    break;
                case "NetStatusRequest":
                    debug("Received net status request from client");
                    break;
                case "Data":
                    debug("Received data packet from client, sequence " + result.sequence);
                    client.inputStream.write(result.data, result.sequence, false);
                    break;
                case "DataFragment":
                    debug("Received data fragment from client, sequence " + result.sequence);
                    client.inputStream.write(result.data, result.sequence, true);
                    break;
                case "OutOfOrder":
                    debug("Received out-order-packet packet on channel " +
                        result.channel +
                        ", sequence " +
                        result.sequence);
                    client.outputStream.resendData(result.sequence);
                    break;
                case "Ack":
                    debug("Ack, sequence " + result.sequence);
                    client.outputStream.ack(result.sequence);
                    break;
                case "ZonePing":
                    debug("Receive Zone Ping ");
                    me._sendPacket(client, "ZonePing", {
                        PingId: result.PingId,
                        Data: result.Data,
                    });
                    break;
                case "FatalError":
                    debug("Received fatal error from client");
                    break;
                case "FatalErrorReply":
                    break;
            }
        }
    }
    var n0 = 0;
    var n1 = 0;
    var n2 = 0;
    connection.on("message", function (data, remote) {
        var client;
        var clientId = remote.address + ":" + remote.port;
        debug(data.length + " bytes from ", clientId);
        var unknow_client;
        // if doesn't know the client
        if (!clients[clientId]) {
            unknow_client = true;
            client = clients[clientId] = {
                sessionId: 0,
                address: remote.address,
                port: remote.port,
                crcSeed: me._crcSeed,
                crcLength: 2,
                clientUdpLength: 512,
                serverUdpLength: 512,
                sequences: [],
                compression: me._compression,
                useEncryption: true,
                outQueue: [],
                outOfOrderPackets: [],
                nextAck: -1,
                lastAck: -1,
                inputStream: new SOEInputStream(cryptoKey),
                outputStream: new SOEOutputStream(cryptoKey),
            };
            client.inputStream.on("data", function (err, data) {
                me.emit("appdata", null, client, data);
            });
            client.inputStream.on("ack", function (err, sequence) {
                client.nextAck = sequence;
            });
            client.inputStream.on("outoforder", function (err, expected, sequence) {
                client.outOfOrderPackets.push(sequence);
            });
            client.outputStream.on("data", function (err, data, sequence, fragment) {
                if (fragment) {
                    me._sendPacket(client, "DataFragment", {
                        sequence: sequence,
                        data: data,
                    });
                }
                else {
                    me._sendPacket(client, "Data", {
                        sequence: sequence,
                        data: data,
                    });
                }
            });
            var checkClientOutQueue_1 = function () {
                if (client.outQueue.length) {
                    var data_1 = client.outQueue.shift();
                    me._connection.send(data_1, 0, data_1.length, client.port, client.address, function (err, bytes) { });
                }
                client.outQueueTimer = setTimeout(checkClientOutQueue_1, 0);
            };
            checkClientOutQueue_1();
            var checkAck_1 = function () {
                if (client.lastAck != client.nextAck) {
                    client.lastAck = client.nextAck;
                    me._sendPacket(client, "Ack", {
                        channel: 0,
                        sequence: client.nextAck,
                    }, true);
                }
                client.ackTimer = setTimeout(checkAck_1, 0); // maybe this is to much if we have a lot of ppl connected
            };
            checkAck_1();
            var checkOutOfOrderQueue_1 = function () {
                if (client.outOfOrderPackets.length) {
                    var packets_1 = [];
                    for (var i = 0; i < 20; i++) {
                        var sequence = client.outOfOrderPackets.shift();
                        packets_1.push({
                            name: "OutOfOrder",
                            soePacket: {
                                channel: 0,
                                sequence: sequence,
                            },
                        });
                        if (!client.outOfOrderPackets.length) {
                            break;
                        }
                    }
                    debug("Sending " + packets_1.length + " OutOfOrder packets");
                    me._sendPacket(client, "MultiPacket", {
                        subPackets: packets_1,
                    }, true);
                }
                client.outOfOrderTimer = setTimeout(checkOutOfOrderQueue_1, 1000);
            };
            checkOutOfOrderQueue_1();
            me.emit("connect", null, clients[clientId]);
        }
        client = clients[clientId];
        var result = me._protocol.parse(data, client.crcSeed, client.compression);
        if (result !== undefined && result !== null) {
            if (!unknow_client &&
                result.soePacket &&
                result.soePacket.name === "SessionRequest") {
                delete clients[clientId];
                debug("Delete an old session badly closed by the client (", clientId, ") )");
            }
            handlePacket(client, result);
        }
    });
    connection.on("listening", function () {
        var _a = this.address(), address = _a.address, port = _a.port;
        debug("Listening on " + address + ":" + port);
    });
}
util.inherits(SOEServer, EventEmitter);
SOEServer.prototype.start = function (compression, crcSeed, crcLength, udpLength) {
    this._compression = compression;
    this._crcSeed = crcSeed;
    this._crcLength = crcLength;
    this._udpLength = udpLength;
    this._connection.bind(this._serverPort, function () { });
};
SOEServer.prototype.stop = function () {
    for (var a in this._clients) {
        if (this._clients.hasOwnProperty(a)) {
            clearTimeout(this._clients[a].outQueueTimer);
            clearTimeout(this._clients[a].ackTimer);
            clearTimeout(this._clients[a].outOfOrderTimer);
        }
    }
    this._connection.close();
};
SOEServer.prototype._sendPacket = function (client, packetName, packet, prioritize) {
    try {
        var data = this._protocol.pack(packetName, packet, client.crcSeed, client.compression);
    }
    catch (e) {
        throw (packetName +
            " " +
            client.crcSeed +
            " " +
            client.compression +
            " " +
            JSON.stringify(packet, null, 4));
    }
    if (prioritize) {
        client.outQueue.unshift(data);
    }
    else {
        client.outQueue.push(data);
    }
};
SOEServer.prototype.sendAppData = function (client, data, overrideEncryption) {
    if (client.outputStream._useEncryption) {
        debug("Sending app data: " + data.length + " bytes with encryption");
    }
    else {
        debug("Sending app data: " + data.length + " bytes");
    }
    client.outputStream.write(data, overrideEncryption);
};
SOEServer.prototype.setEncryption = function (client, value) {
    client.outputStream.setEncryption(value);
    client.inputStream.setEncryption(value);
};
SOEServer.prototype.toggleEncryption = function (client) {
    client.outputStream.toggleEncryption();
    client.inputStream.toggleEncryption();
};
SOEServer.prototype.deleteClient = function (client) {
    delete this._clients[client.address + ":" + client.port];
    debug("client connection from port : ", client.port, " deleted");
};
exports.SOEServer = SOEServer;
