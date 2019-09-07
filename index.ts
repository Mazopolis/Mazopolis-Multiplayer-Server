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

const app = require("express")() // ExpressJS + App setup
const ws = require("ws") // WebSockets
const fs = require("fs") // FS
const admin = require("firebase-admin") // Firebase
admin.initializeApp({
    credential: admin.credential.cert(require("/home/lawson/serverstuff/server/key.json")),
    databaseURL: 'https://hubbit-mazer.firebaseio.com'
});

//  -----------
//   FUNCTIONS
//  -----------
// Test For Party
function testForParty(prty):any {
    let r:any = false
    for (let i = 0; i < activeParties.length; i++) {
        const party = activeParties[i];
        if(party.id == prty) {
            r = i
        }
    } 
    return r
}

//  ---------
//   CLASSES
//  ---------

class Point {
    x: number;
    y: number;
    constructor(X: number, Y: number) {
        this.x = X
        this.y = Y
    }
}

class UserFace {
    faceId: string;
    url: string;
    constructor(public FaceID: string) {
        this.faceId = FaceID
        this.url = "/faces/" + FaceID + "/face.png"
    }
}

class User {
    face: UserFace;
    username: string;
    position: Point;
    connection: any;
    send: Function;
    uid: string;
    isOnline: Function;
    sendRaw: Function;
    constructor(public UserFace: UserFace, public Username: string, public PlayerPosition: Point, public Connection: any, public UserId: string) {
        this.face = UserFace
        this.uid = UserId
        this.username = Username
        this.position = PlayerPosition
        this.connection = Connection
        this.isOnline = function() {
            if(this.connection.readyState = ws.OPEN) {
                return true;
            }else{
                return false;
            }
        }
        this.send = function(event: string, message:any) {
            if(this.isOnline() === true) {
                message.event = event
                let fmsg = JSON.stringify(message)
                this.connection.send(fmsg)
            }
        };
        this.sendRaw = function(msg) {
            if(this.isOnline() === true) {
                let fmsg = JSON.stringify(msg)
                this.connection.send(fmsg)
            }
        }
        this.connection.on("close", () => {
            var uid = this.uid
            var partyIndex = testForParty(this.connection.pid)
            // if party exists
            if(typeof partyIndex == "number") {
                var party = activeParties[partyIndex]
                party.broadcast("disconnect",{who: uid})
            }
        })
    }
}

// Active Parties
let activeParties:Array<Party> = []

class Party {
    members: Array<User>;
    name: string;
    private: boolean;
    id: string;
    leader: string;
    broadcast: Function;
    handleJoin: Function;
    constructor(public PartyName: string,public Leader: string,public IsPrivate: boolean) {
        this.members = []
        this.name = PartyName;
        this.private = IsPrivate
        this.id = (activeParties.length + 1).toString()
        this.leader = Leader
        // FUNCTIONS
        this.broadcast = function(event:string,message:any):void {
            this.members.forEach(user => {
                message.event = event
                user.sendRaw(message)
            });
        }
        this.handleJoin = function(user: User):void {
            this.broadcast("join",{nickname:user.username, plrface:user.face.faceId, plrsize: 20, who: user.uid})
            this.members.forEach(member => {
                if(member.isOnline()) {
                    user.send("join",{nickname:member.username, plrface:member.face.faceId, plrsize: 20, who: member.uid})
                }
            });
            this.members.push(user)
            user.sendRaw({event: "success"})
        }
    }
}

// --------------
//  SERVER SETUP
// --------------

const port = 443
const http = require('http').createServer(app);
const options = {
    key: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/privkey.pem"),
    cert: fs.readFileSync('/etc/letsencrypt/live/server.mazopolis.com/cert.pem'),
    ca: fs.readFileSync("/etc/letsencrypt/live/server.mazopolis.com/chain.pem")
};
const https = require('https').createServer(options, app)
app.get('/', (req, res) => {
    if(req.secure) {
        res.send('<h1>Error: MARV1N</h1><hr><i>ur not supposed to be here. im feeling so depressed.</i><br><img style="width: 100%;height:auto" alt="(insert gif of marvin)" src="https://media1.giphy.com/media/Sz7MJy6cDMZJS/giphy.gif">');
    } else {
        res.redirect('https://server.mazopolis.com')
    }
});
app.get("/createPrivateParty", (req,res) => {
    admin.auth().verifyIdToken(req.query.token).then(user => {
        let newParty = new Party(req.query.name,user.uid,true)
        activeParties.push(newParty)
        res.send(newParty.id)
    })
})
http.listen(80, function() {
    console.log('HTTP: enabled');
});
https.listen(443, function() {
    console.log('HTTPS: enabled')
})
let wss = new ws.Server({
    server: https
});

// Test Variables:
let testParty = new Party("TestParty","lawsy",true)
testParty.id = "deeablo"
activeParties.push(testParty)

// ---------------- \\
// |    SERVER    | \\
// ---------------- \\

wss.on("connection", (con) => {
    console.log("Player connection recieved.")
    con.on("message",msg => {
        let pMsg;
        try {
            pMsg = JSON.parse(msg)
        }catch(err) {
            console.warn("Error decoding message!",err,msg)
        }
        if(pMsg.token) {
            console.log("Token recieved. Verifying...")
            admin.auth().verifyIdToken(pMsg.token).then(usr => {
                console.log("Verified as: " + usr.uid)
                console.log("Now getting user info and constructing User Object")
                admin.auth().getUser(usr.uid).then(user => {
                    console.log("Got user info! Nickname set as " + user.displayName)
                    admin.firestore().collection("avatars").doc(usr.uid).get().then(doc => {
                        // does user have avatar?
                        if(doc.exists) {
                            console.log("user has avatar")
                            // yes, set to that.
                            let position = new Point(0,0)
                            let face = new UserFace(doc.data().face)
                            let theUser = new User(face,user.displayName,position,con,usr.uid)
                            // Add them to the connection
                            con.uid = theUser.uid
                            con.pid = pMsg.pid
                            // If Party Exists,
                            if(typeof testForParty(pMsg.pid) == "number") {
                                // it does!
                                console.log("party exists")
                                let partyIndex = testForParty(pMsg.pid)
                                activeParties[partyIndex].handleJoin(theUser)
                            }else{
                                console.warn("user tried to join a party that doesn't exist!",pMsg.pid)
                            }
                        } else {
                            console.log("user doesn't have avatar")
                            // nope, set to default (smile)
                            let position = new Point(0,0)
                            let face = new UserFace("smile")
                            let theUser = new User(face,user.displayName,position,con,usr.uid)
                            // Add them to the connection
                            con.uid = theUser.uid
                            con.pid = pMsg.pid
                            // If Party Exists,
                            if(typeof testForParty(pMsg.pid) == "number") {
                                // it does!
                                console.log("party exists")
                                let partyIndex = testForParty(pMsg.pid)
                                activeParties[partyIndex].handleJoin(theUser)
                            }else{
                                console.warn("user tried to join a party that doesn't exist!",pMsg.pid)
                            }
                        }
                    })
                })
            })
        }else if(pMsg.event == "move") {
            if(typeof testForParty(pMsg.pid) == "number") {
                // it exists!
                let prtyIndex = testForParty(pMsg.pid)
                let party = activeParties[prtyIndex]
                party.broadcast("move",{who:pMsg.uid,pos:pMsg.position})
            }else{
                console.warn("user tried to move in party that doesn't exist!",pMsg.pid)
            }
        }
    })
    // ----------------
    //     LEAVING
    // ----------------
    
    // Moved to user class.
})