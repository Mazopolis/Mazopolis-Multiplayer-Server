/*
    Mazopolis
    Multiplayer
    Server
    
    Author: MoonBarc
    Version: v2.0
    (c) Copyright MoonBarc, 2019.
*/
//  --------------
//   DEPENDENCIES
//  --------------
var app = require("express")(); // ExpressJS + App setup
var ws = require("ws"); // WebSockets
var fs = require("fs"); // FS
var admin = require("firebase-admin"); // Firebase
admin.initializeApp({
    credential: admin.credential.cert(require("./key.json")),
    databaseURL: 'https://hubbit-mazer.firebaseio.com'
});
//  -----------
//   FUNCTIONS
//  -----------
// Test For Party
function testForParty(prty) {
    var r = false;
    for (var i = 0; i < activeParties.length; i++) {
        var party = activeParties[i];
        if (party.id == prty) {
            r = i;
        }
    }
    return r;
}
//  ---------
//   CLASSES
//  ---------
var Point = /** @class */ (function () {
    function Point(X, Y) {
        this.x = X;
        this.y = Y;
    }
    return Point;
}());
var UserFace = /** @class */ (function () {
    function UserFace(FaceID) {
        this.FaceID = FaceID;
        this.faceId = FaceID;
        this.url = "/faces/" + FaceID + "/face.png";
    }
    return UserFace;
}());
var User = /** @class */ (function () {
    function User(UserFace, Username, PlayerPosition, Connection, UserId) {
        this.UserFace = UserFace;
        this.Username = Username;
        this.PlayerPosition = PlayerPosition;
        this.Connection = Connection;
        this.UserId = UserId;
        this.face = UserFace;
        this.uid = UserId;
        this.username = Username;
        this.position = PlayerPosition;
        this.connection = Connection;
        this.isOnline = function () {
            if (this.connection.readyState = ws.OPEN) {
                return true;
            }
            else {
                return false;
            }
        };
        this.send = function (event, message) {
            if (this.isOnline() === true) {
                message.event = event;
                var fmsg = JSON.stringify(message);
                this.connection.send(fmsg);
            }
        };
        this.sendRaw = function (msg) {
            if (this.isOnline() === true) {
                var fmsg = JSON.stringify(msg);
                this.connection.send(fmsg);
            }
        };
        // Narrowing down code that could cause problems....
        // this.connection.on("close", () => {
        //     var uid = this.uid
        //     var partyIndex = testForParty(this.connection.pid)
        //     // if party exists
        //     if(typeof partyIndex == "number") {
        //         var party = activeParties[partyIndex]
        //         party.broadcast("disconnect",{who: uid})
        //     }
        // })
    }
    return User;
}());
// Active Parties
var activeParties = [];
var Party = /** @class */ (function () {
    function Party(PartyName, Leader, IsPrivate) {
        this.PartyName = PartyName;
        this.Leader = Leader;
        this.IsPrivate = IsPrivate;
        this.members = [];
        this.name = PartyName;
        this.private = IsPrivate;
        this.id = (activeParties.length + 1).toString();
        this.leader = Leader;
        // FUNCTIONS
        this.broadcast = function (event, message) {
            this.members.forEach(function (user) {
                message.event = event;
                user.sendRaw(message);
            });
        };
        this.handleJoin = function (user) {
            this.broadcast("join", { nickname: user.username, plrface: user.face.faceId, plrsize: 20, who: user.uid });
            this.members.forEach(function (member) {
                if (member.isOnline()) {
                    user.send("join", { nickname: member.username, plrface: member.face.faceId, plrsize: 20, who: member.uid });
                }
            });
            this.members.push(user);
            user.sendRaw({ event: "success" });
        };
    }
    return Party;
}());
// --------------
//  SERVER SETUP
// --------------
var port = 443;
var http = require('http').createServer(app);
var options = {
    key: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/privkey.pem"),
    cert: fs.readFileSync('/etc/letsencrypt/live/server.mazopolis.com/cert.pem'),
    ca: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/chain.pem")
};
var https = require('https').createServer(options, app);
app.get('/', function (req, res) {
    if (req.secure) {
        res.send('<h1>Error: MARV1N</h1><hr><i>ur not supposed to be here. im feeling so depressed.</i><br><img style="width: 100%;height:auto" alt="(insert gif of marvin)" src="https://media1.giphy.com/media/Sz7MJy6cDMZJS/giphy.gif">');
    }
    else {
        res.redirect('https://server.mazopolis.com');
    }
});
app.get("/createPrivateParty", function (req, res) {
    admin.auth().verifyIdToken(req.query.token).then(function (user) {
        var newParty = new Party(req.query.name, user.uid, true);
        activeParties.push(newParty);
        res.send(newParty.id);
    });
});
http.listen(80, function () {
    console.log('HTTP: enabled');
});
https.listen(443, function () {
    console.log('HTTPS: enabled');
});
var wss = new ws.Server({
    server: https
});
// Test Variables:
var testParty = new Party("TestParty", "lawsy", true);
testParty.id = "deeablo";
activeParties.push(testParty);
// ---------------- \\
// |    SERVER    | \\
// ---------------- \\
wss.on("connection", function (con) {
    console.log("Player connection recieved.");
    con.on("message", function (msg) {
        var pMsg;
        try {
            pMsg = JSON.parse(msg);
        }
        catch (err) {
            console.warn("Error decoding message!", err, msg);
        }
        if (pMsg.token) {
            console.log("Token recieved. Verifying...");
            admin.auth().verifyIdToken(pMsg.token).then(function (usr) {
                console.log("Verified as: " + usr.uid);
                console.log("Now getting user info and constructing User Object");
                admin.auth().getUser(usr.uid).then(function (user) {
                    console.log("Got user info! Nickname set as " + user.displayName);
                    admin.firestore().collection("avatars").doc(usr.uid).get().then(function (doc) {
                        // does user have avatar?
                        if (doc.exists) {
                            console.log("user has avatar");
                            // yes, set to that.
                            var position = new Point(0, 0);
                            var face = new UserFace(doc.data().face);
                            var theUser = new User(face, user.displayName, position, con, usr.uid);
                            // Add them to the connection
                            con.uid = theUser.uid;
                            con.pid = pMsg.pid;
                            // If Party Exists,
                            if (typeof testForParty(pMsg.pid) == "number") {
                                // it does!
                                console.log("party exists");
                                var partyIndex = testForParty(pMsg.pid);
                                activeParties[partyIndex].handleJoin(theUser);
                            }
                            else {
                                console.warn("user tried to join a party that doesn't exist!", pMsg.pid);
                            }
                        }
                        else {
                            console.log("user doesn't have avatar");
                            // nope, set to default (smile)
                            var position = new Point(0, 0);
                            var face = new UserFace("smile");
                            var theUser = new User(face, user.displayName, position, con, usr.uid);
                            // Add them to the connection
                            con.uid = theUser.uid;
                            con.pid = pMsg.pid;
                            // If Party Exists,
                            if (typeof testForParty(pMsg.pid) == "number") {
                                // it does!
                                console.log("party exists");
                                var partyIndex = testForParty(pMsg.pid);
                                activeParties[partyIndex].handleJoin(theUser);
                            }
                            else {
                                console.warn("user tried to join a party that doesn't exist!", pMsg.pid);
                            }
                        }
                    });
                });
            });
        }
        else if (pMsg.event == "move") {
            if (typeof testForParty(pMsg.pid) == "number") {
                // it exists!
                var prtyIndex = testForParty(pMsg.pid);
                var party = activeParties[prtyIndex];
                party.broadcast("move", { who: pMsg.uid, pos: pMsg.position });
            }
            else {
                console.warn("user tried to move in party that doesn't exist!", pMsg.pid);
            }
        }
    });
    // ----------------
    //     LEAVING
    // ----------------
    // Moved to user class.
});
