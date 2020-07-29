import { EventEmitter } from "events";

const SOEServer = require("./soeserver").SOEServer,
  LoginProtocol = require("./loginprotocol").LoginProtocol,
  debug = require("debug")("LoginServer"),
  MongoClient = require("mongodb").MongoClient;

interface LoginProtocol {
  parse: Function;
  pack: Function;
}

interface SoeServer {
  on: Function;
  start: Function;
  stop: Function;
  _sendPacket: Function;
  sendAppData: Function;
  toggleEncryption: Function;
  toggleDataDump: Function;
}

interface Client {
  sessionId: number;
  address: string;
  port: number;
  crcSeed: number;
  crcLength: number;
  clientUdpLength: number;
  serverUdpLength: number;
  sequences: any;
  compression: number;
  useEncryption: boolean;
  outQueue: any;
  outOfOrderPackets: any;
  nextAck: number;
  lastAck: number;
  inputStream: Function;
  outputStream: Function;
  outQueueTimer: Function;
  ackTimer: Function;
  outOfOrderTimer: Function;
}

export class LoginServer extends EventEmitter {
  _soeServer: SoeServer;
  _protocol: LoginProtocol;
  _db: any; // TODO
  _mongoClient: any;
  _usingMongo: boolean;
  _compression: number;
  _crcSeed: number;
  _crcLength: number;
  _udpLength: number;
  _gameId: number;
  _environment: string;

  constructor(
    gameId: number,
    environment: string,
    usingMongo: boolean,
    serverPort: number,
    loginKey: string
  ) {
    super();
    this._usingMongo = usingMongo;
    this._compression = 0x0100;
    this._crcSeed = 0;
    this._crcLength = 2;
    this._udpLength = 512;

    this._gameId = gameId;
    this._environment = environment;

    this._soeServer = new SOEServer("LoginUdp_9", serverPort, loginKey);
    this._protocol = new LoginProtocol();
    this._soeServer.on("connect", (err: string, client: Client) => {
      debug("Client connected from " + client.address + ":" + client.port);
      //server.emit('connect', err, client);
    });
    this._soeServer.on("disconnect", (err: string, client: Client) => {
      debug("Client disconnected from " + client.address + ":" + client.port);
      //server.emit('disconnect', err, client);
    });
    this._soeServer.on("session", (err: string, client: Client) => {
      debug("Session started for client " + client.address + ":" + client.port);
    });
    this._soeServer.on(
      "Force_sendServerList",
      async (err: string, client: Client) => {
        const servers = await this._db.collection("servers").find().toArray();
        // remove object id
        for (let i = 0; i < servers.length; i++) {
          delete servers[i]._id;
        }
        var data = this._protocol.pack("ServerListReply", {
          servers: servers,
        });
        this._soeServer.sendAppData(client, data, true);
      }
    );
    this._soeServer.on(
      "SendServerUpdate",
      async (err: string, client: Client) => {
        const servers = await this._db.collection("servers").find().toArray();
        for (var i = 0; i < servers.length; i++) {
          delete servers[i]._id; // remove object id
          var data = this._protocol.pack("ServerUpdate", servers[i]);
          this._soeServer.sendAppData(client, data, true);
        }
      }
    );

    this._soeServer.on(
      "appdata",
      async (err: string, client: Client, data: Buffer) => {
        var packet = this._protocol.parse(data);
        if (packet != false) {
          // if packet parsing succeed
          var result = packet.result;
          switch (packet.name) {
            case "LoginRequest":
              /*
              backend.login(result.sessionId, result.fingerprint, function (
                err,
                result
              ) {
                if (err) {
                  server.emit("login", new LoginError("Login failed"));
                } else {
                  var data = protocol.pack("LoginReply", result);
                  soeServer.sendAppData(client, data, true);
                }
              });
              */
              var falsified_data = {
                // HACK
                loggedIn: true,
                status: 1,
                isMember: true,
                isInternal: true,
                namespace: "",
                payload: "e",
              };
              var data: Buffer = this._protocol.pack(
                "LoginReply",
                falsified_data
              );
              this._soeServer.sendAppData(client, data, true);
              break;
            case "ServerListRequest":
              const servers = await this._db
                .collection("servers")
                .find()
                .toArray();
              var data: Buffer = this._protocol.pack("ServerListReply", {
                servers: servers,
              });
              this._soeServer.sendAppData(client, data, true);

              break;
            case "CharacterSelectInfoRequest":
              /*
            backend.getCharacterInfo(function (err, result) {
              if (err) {
                server.emit(
                  "characterselectinforequest",
                  new LoginError("Character select info request failed")
                );
              } else {
                var data = protocol.pack("CharacterSelectInfoReply", result);
                soeServer.sendAppData(client, data, true, true);
              }
            });
            */
              debug("CharacterSelectInfoRequest");
              break;
            case "CharacterLoginRequest":
              /*
            backend.characterLogin(null, null, null, function (err, result) {
              if (err) {
                server.emit(
                  "characterloginrequest",
                  new LoginError("Character login request failed")
                );
              } else {
                result = JSON.parse(
                  fs.readFileSync("data/characterloginreply.json")
                );
                var data = protocol.pack("CharacterLoginReply", result);
                soeServer.sendAppData(client, data, true);
              }
            });
            */
              debug("CharacterLoginRequest");
              break;
          }
        } else {
          debug("Packet parsing was unsuccesful");
        }
      }
    );
  }
  async start() {
    debug("Starting server");

    if (this._usingMongo) {
      const uri =
        "mongodb://localhost:27017/?readPreference=primary&appname=MongoDB%20Compass%20Community&ssl=false";
      const mongoClient = (this._mongoClient = new MongoClient(uri, {
        useUnifiedTopology: true,
        native_parser: true,
      }));
      try {
        let waiting = await mongoClient.connect();
      } catch (e) {
        throw console.error("[ERROR]Unable to connect to mongo server");
      }
      if (mongoClient.isConnected()) {
        debug("connected to mongo !");
        this._db = await mongoClient.db("h1server");
      } else {
        throw console.error("Unable to authenticate on mongo !", 2);
      }
    }

    this._soeServer.start(
      this._compression,
      this._crcSeed,
      this._crcLength,
      this._udpLength
    );
  }
  data(collectionName: string) {
    if (this._db) {
      return this._db.collection(collectionName);
    }
  }
  stop() {
    debug("Shutting down");
    process.exit(1);
  }
}
