const credential = require('./var.js');
const serAccount = require('./firebase_token.json')
const express = require('express')
const cors = require('cors')
const mysql = require('mysql');
const fcm = require('firebase-admin')
const fs = require('fs');
const moment = require("moment");
const schedule = require('node-schedule');
const bodyParser = require("body-parser");
const auth = require('basic-auth');
const rateLimit = require('express-rate-limit');
const url = require('url');
const { AsciiTable3, AlignmentEnum } = require('ascii-table3');

const { Client, IntentsBitField, EmbedBuilder  } = require('discord.js');
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

const app = express()
app.use(cors({
    origin: '*',
}));
app.use(rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100
})
);
app.set('trust proxy', 1)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

require('console-stamp')(console, 'yyyy/mm/dd HH:MM:ss.l');

const options = {
    key: fs.readFileSync('./privkey.pem'),
    cert: fs.readFileSync('./cert.pem')
};

const https = require('https').createServer(options, app);
const http = require('http').createServer(app)

const io = require('socket.io')(https)
const application = io.of('/application');

const http_port = 80
const https_port = 443

const wsModule = require('ws');

const ClientSocket = new wsModule.Server(
    {
        noServer: true
    }
);

const DeviceSocket = new wsModule.Server(
    {
        noServer: true
    }
);

var ConnectedDevice = [];
var DeviceLog = [];
var DiscordConnected = 0;

function heartbeat() {
    this.isAlive = true;
}

fcm.initializeApp({
    credential: fcm.credential.cert(serAccount),
})

const connection = mysql.createConnection({
    host: credential.mysql_host,
    user: credential.mysql_user,
    password: credential.mysql_pw,
    database: credential.mysql_db
});

client.login(credential.discord_token);

client.on('ready', (c) => {
    console.log(`${c.user.tag} is online.`);
    DiscordConnected = 1;
});

client.on('messageCreate', (message) => {
    if (message.author.bot) {
        return;
    }
});

client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === '앱버전') {
        var system
        if(interaction.options.get('first-number').value == 0)
        {
            system = "android";
        }else
        {
            system = "ios";
        }
        const version = interaction.options.get('input').value;
        console.log("[Discord] App Version Changed:" + system + " " + version);
        connection.query(`UPDATE app_version SET version = ? WHERE os_system = ?;`, [version, system], (error, results) => {
            if (error) {
                console.log('app_version Update query error:');
                console.log(error);
                return;
            }
            //console.log(results);
        });
        return interaction.reply('앱 버전이 변경되었습니다.');
    }

    if (interaction.commandName === '상태변경') {
        const device_no = interaction.options.get('first-number').value;
        const device_status = interaction.options.get('second-number').value;
        console.log("[Discord] Status Updated Device_NO:" + device_no + " Data:" + device_status);
        StatusUpdate(device_no, device_status)
        return interaction.reply('OK');
    }
    if (interaction.commandName === '연결목록') {
        if (ConnectedDevice.length == 0) {
            return interaction.reply("연결된 장치가 없습니다.");
        }
        else {
            var table = new AsciiTable3('임베디드 장치 연결 목록')
                .setHeading('HWID', 'CH1', 'CH2')
                .setAligns(AlignmentEnum.LEFT)
            for (let i = 0; i < ConnectedDevice.length; i++) {
                table.addRow(ConnectedDevice[i].hwid, ConnectedDevice[i].ch1, ConnectedDevice[i].ch2)
            }
            return interaction.reply(table.toString());
        }
    }
    if (interaction.commandName === '상태확인') {
        const device_no = interaction.options.get('first-number').value;
        if (ConnectedDevice.length == 0) {
            return interaction.reply("연결된 장치가 없습니다.");
        }
        else {
            if (ConnectedDevice.findIndex(obj => obj.hwid == device_no) < 0)
            {
                return interaction.reply("연결되지 않은 장치입니다.");
            }
            let DataObject = new Object();
            DataObject.title = "GetData"
            DataObject.data = "Status"
            Sendto(device_no, JSON.stringify(DataObject))
            return interaction.reply("OK");
        }
    }
});

client.on('ready', (c) => {
    console.log(`${c.user.tag} is online.`);
});

client.login(credential.discord_token);

https.on('upgrade', function upgrade(request, socket, head) {
    const { pathname } = url.parse(request.url);
    const user = auth(request);
    if (pathname === '/client') {
        ClientSocket.handleUpgrade(request, socket, head, function done(ws) {
            ClientSocket.emit('connection', ws, request);
        });
    } else if (pathname === '/device') {
        if (!user || user.name !== credential.auth_name || user.pass !== credential.auth_pw) {
            socket.destroy();
        } else {
            DeviceSocket.handleUpgrade(request, socket, head, function done(ws) {
                DeviceSocket.emit('connection', ws, request);
            });
        }
    } 
    else {
        //Socket.IO로 임시로 연결
    }
});

ClientSocket.on('connection', (ws, request) => {//클라이언트 Websocket
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    if (ws.readyState === ws.OPEN) {
        //ws.send(`Hello From Server`);
    }
    ws.on('close', () => {
        //console.log(`Client [${request.headers['sec-websocket-key']}] closed`);
    })
});

DeviceSocket.on('connection', (ws, request) => {//장치 Websocket
    const prev_device_index = ConnectedDevice.findIndex((item) => item.hwid == request.headers['hwid']);
    if(prev_device_index != -1)
    {
        ConnectedDevice[prev_device_index].ws.close();
        ConnectedDevice.splice(prev_device_index, 1);
    }
    console.log(`[Device][Connected] [${request.headers['hwid']},${request.headers['ch1']},${request.headers['ch2']}]`);
    if(DiscordConnected == 1)
    {
        const channel = client.channels.cache.get(credential.discord_channelid);
        channel.send(`장치가 연결되었습니다. [HWID : "${request.headers['hwid']}", CH1 : "${request.headers['ch1']}", CH2 : "${request.headers['ch2']}"]`);
    }
    let DeviceObject = new Object();
    DeviceObject.ws = ws;
    DeviceObject.hwid = request.headers['hwid'];
    DeviceObject.ch1 = request.headers['ch1'];
    DeviceObject.ch2 = request.headers['ch2'];
    ConnectedDevice.push(DeviceObject);
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    if (ws.readyState === ws.OPEN) {
    }

    ws.on('message', (msg) => {
        const device_data = JSON.parse(msg)
        if (device_data.title == "Update") {
            console.log("[Device][Update] ID: " + device_data.id + " Status: " + device_data.state)
            StatusUpdate(device_data.id, device_data.state)
        } else if (device_data.title == "GetData") {
            device_data.ch1_current = device_data.ch1_current.toFixed(2)
            device_data.ch2_current = device_data.ch2_current.toFixed(2)
            device_data.CH1_Curr_W = device_data.CH1_Curr_W.toFixed(3)
            device_data.CH1_Curr_D = device_data.CH1_Curr_D.toFixed(3)
            device_data.CH2_Curr_W = device_data.CH2_Curr_W.toFixed(3)
            device_data.CH2_Curr_D = device_data.CH2_Curr_D.toFixed(3)
            const deviceData = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`고유번호 ${request.headers['hwid']}번 기기 보고`)
                .setDescription(`FW_VER : ${device_data.fw_ver}`)
                .addFields(
                    {
                        name: 'CH1', value: `장치번호 : ${device_data.ch1_deviceno}\n모드 : ${device_data.ch1_mode}\n동작상태 : ${device_data.ch1_status}\n
                    전류 : ${device_data.ch1_current}A\n유량 : ${device_data.ch1_flow}\n 배수 : ${device_data.ch1_drain}\n
                    세탁기 동작조건\n지연시간 : ${device_data.CH1_EndDelay_W}\n전류 : ${device_data.CH1_Curr_W}A\n 유량 : ${device_data.CH1_Flow_W}\n
                    건조기 동작조건\n지연시간 : ${device_data.CH1_EndDelay_D}\n전류 : ${device_data.CH1_Curr_D}A`, inline: true
                    },
                    {
                        name: 'CH2', value: `장치번호 : ${device_data.ch2_deviceno}\n모드 : ${device_data.ch2_mode}\n동작상태 : ${device_data.ch2_status}\n
                    전류 : ${device_data.ch2_current}A\n유량 : ${device_data.ch2_flow}\n 배수 : ${device_data.ch2_drain}\n
                    세탁기 동작조건\n지연시간 : ${device_data.CH2_EndDelay_W}\n전류 : ${device_data.CH2_Curr_W}A\n 유량 : ${device_data.CH2_Flow_W}\n
                    건조기 동작조건\n지연시간 : ${device_data.CH2_EndDelay_D}\n전류 : ${device_data.CH2_Curr_D}A`, inline: true
                    },
                    { name: '\u200B', value: '\u200B' },
                    { name: '네트워크', value: `SSID : ${device_data.wifi_ssid}\nLocal IP : ${device_data.wifi_ip}\nRSSI : ${device_data.wifi_rssi}\nMAC : ${device_data.mac}`, inline: true },
                )
                .setTimestamp()
            const channel = client.channels.cache.get(credential.discord_channelid);
            channel.send({ embeds: [deviceData] });
        } else if (device_data.title == "Log") {
            console.log("[Device][Log] ID: " + device_data.id)
            const Json_Log = JSON.parse(device_data.log);
            console.log(Json_Log)
            const index = DeviceLog.findIndex(obj => {
                return obj.hwid == request.headers['hwid'] && obj.device_num == device_data.id;
            });
            if (index == -1) {
                let LogObject = new Object();
                LogObject.hwid = request.headers['hwid'];
                LogObject.device_num = device_data.id;
                LogObject.log = Json_Log;
                DeviceLog.push(LogObject);
            } else {
                let jsonMerged = { ...DeviceLog[index].log, ...Json_Log }
                DeviceLog[index].log = jsonMerged;
            }
            if (DeviceLog[index].log.END.local_time != "") {
                console.log("[Device][LogEnd] ID: " + device_data.id)
                const end_index = DeviceLog.findIndex(obj => {
                    return obj.hwid == request.headers['hwid'] && obj.device_num == device_data.id;
                });
                DeviceLog.splice(end_index, 1);
                connection.query(`INSERT INTO DeviceLog (HWID, ID, Start_Time, End_Time, Log) VALUES (?, ?, ?, ?, ?);`, [request.headers['hwid'], device_data.id, DeviceLog[index].log.START.local_time, DeviceLog[index].log.END.local_time, JSON.stringify(DeviceLog[index].log)], (error, results) => {
                    if (error) {
                        console.log('deviceStatus Update query error:');
                        console.log(error);
                        return;
                    }
                    //console.log(results);
                });
                //console.log(DeviceLog[index].log)
            }
        }
    })

    ws.on('close', () => {
        const channel = client.channels.cache.get(credential.discord_channelid);
        channel.send(`장치의 연결이 끊어졌습니다. [HWID : "${request.headers['hwid']}", CH1 : "${request.headers['ch1']}", CH2 : "${request.headers['ch2']}"]<@&${credential.discord_roleid}>`);
        console.log(`[Device][Disconnected] [${request.headers['hwid']},${request.headers['ch1']},${request.headers['ch2']}]`);
        ConnectedDevice.splice(ConnectedDevice.findIndex(obj => obj.hwid == request.headers['hwid']), 1);
        StatusUpdate(request.headers['ch1'], 2)
        StatusUpdate(request.headers['ch2'], 2)
    })
});

const device_Pinginterval = setInterval(function ping() {//장치 Heartbeat
    DeviceSocket.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 20000);

const client_Pinginterval = setInterval(function ping() {//클라이언트 Heartbeat
    ClientSocket.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 50000);

app.get('/', (req, res) => {
    res.sendStatus(200)
})

app.get("/get_log", (req, res) => {//장치 목록
    const num  = req.query.no;
    connection.query(`SELECT Log FROM DeviceLog WHERE No = ?;`,[num] , function (error, results) {
        if (error) {
            console.log('SELECT DeviceLog query error:');
            console.log(error);
            return;
        }
        res.send(results)
        //console.log('==============================================')
    });
});

app.get("/log_list", (req, res) => {//장치 목록
    connection.query(`SELECT No, HWID, ID, Start_Time, End_Time FROM DeviceLog;`, function (error, results) {
        if (error) {
            console.log('SELECT DeviceLog query error:');
            console.log(error);
            return;
        }
        res.send(results)
        //console.log('==============================================')
    });
});

app.get("/device_list", (req, res) => {//장치 목록
    connection.query(`SELECT * FROM deviceStatus;`, function (error, results) {
        if (error) {
            console.log('SELECT * FROM deviceStatus query error:');
            console.log(error);
            return;
        }
        res.send(results)
        //console.log('==============================================')
    });
});

app.get("/app_ver_android", (req, res) => {//앱 버전
    connection.query(`SELECT version FROM app_version WHERE os_system = "android";`, function (error, results) {
        if (error) {
            console.log('SELECT version FROM app_version query error:');
            console.log(error);
            return;
        }
        res.send(results[0])
        //console.log('==============================================')
    });
});

app.get("/app_ver_ios", (req, res) => {//앱 버전
    connection.query(`SELECT version FROM app_version WHERE os_system = "ios";`, function (error, results) {
        if (error) {
            console.log('SELECT version FROM app_version query error:');
            console.log(error);
            return;
        }
        res.send(results[0])
        //console.log('==============================================')
    });
});

app.post("/push_request", (req, res) => {//알림 신청 기능
    let token = req.body.token;
    let device_id = req.body.device_id;
    let expect_state = req.body.expect_state;
    console.log("[App] Push Request Device Token: " + token + " Device ID: " + device_id + " Expect Status: " + expect_state)

    //DB에 중복되는 값 있는지 확인
    connection.query(`SELECT Token FROM PushAlert WHERE device_id = ? AND Expect_Status = ? AND Token = ?;`, [device_id, expect_state, token], function (error, results) {
        let type = new Array();
        if (error) {
            console.log('SELECT Token query error:');
            console.log(error);
            return;
        }

        //중복이면 return
        if (results.length > 0) {
            res.status(304).send('이미 신청된 장치입니다.')
            return;
        } else {//중복 아니면 DB에 Token 등록
            connection.query(`SELECT device_type FROM deviceStatus WHERE id = ?;`, [device_id], function (error, type_results) {
                if (error) {
                    console.log('SELECT device_type query error:');
                    console.log(error);
                    return;
                }

                connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status, device_type) VALUES (?, ?, ?, ?);`, [token, device_id, expect_state, type_results[0].device_type], (error, results) => {
                    if (error) {
                        console.log('deviceStatus Update query error:');
                        console.log(error);
                        return;
                    }
                    //console.log(results);
                    res.status(200).send('알림 신청 성공.')
                });
            });

        }
    });
});

app.post("/push_list", (req, res) => {//알림 신청 목록 확인 기능
    let token = req.body.token;
    console.log("[App] Push List Request Device Token: " + token)

    connection.query(`SELECT device_id, device_type, state FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
        if (error) {
            console.log('SELECT Token query error:');
            console.log(error);
            return;
        }
        res.send(results)
        //console.log(results);
    });
});

app.post("/push_cancel", (req, res) => {//알림 취소 기능
    let token = req.body.token;
    let device_id = req.body.device_id;
    console.log("[App] Push Cancel Request Device Token: " + token + " Device ID: " + device_id)

    connection.query(`DELETE FROM PushAlert WHERE device_id = ? AND Token = ?;`, [device_id, token], function (error, results) {
        if (error) {
            console.log('SELECT Token query error:');
            console.log(error);
            return;
        }

        connection.query(`SELECT device_id, device_type FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            res.send(results)
        });
    });

});

io.on('connection', socket => {
    console.log('[Socket.IO] Embedded device Connected:', socket.id)
})

application.on('connection', socket => {
    console.log('[Socket.IO] Client Connected:', socket.id)

    //Application과 Frontend에 현재 상태 DB 넘기기
    connection.query(`SELECT * FROM deviceStatus;`, function (error, results) {
        if (error) {
            console.log('SELECT * FROM deviceStatus query error:');
            console.log(error);
            return;
        }
        application.to(socket.id).emit('update', results);
        //console.log('==============================================')
    });

    //Application에서 request_push 받으면
    socket.on('request_push', push_data => {
        const { token, device_id, expect_state } = push_data;
        console.log("[App] Push Request Device Token: " + token + " Device ID: " + device_id + " Expect Status: " + expect_state)

        //DB에 중복되는 값 있는지 확인
        connection.query(`SELECT Token FROM PushAlert WHERE device_id = ? AND Expect_Status = ? AND Token = ?;`, [device_id, expect_state, token], function (error, results) {
            let type = new Array();
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }

            //중복이면 return
            if (results.length > 0) {
                console.log('This is a duplicate value');
                console.log('==============================================')
                return;
            } else {//중복 아니면 DB에 Token 등록
                connection.query(`SELECT device_type FROM deviceStatus WHERE id = ?;`, [device_id], function (error, type_results) {
                    if (error) {
                        console.log('SELECT device_type query error:');
                        console.log(error);
                        return;
                    }

                    connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status, device_type) VALUES (?, ?, ?, ?);`, [token, device_id, expect_state, type_results[0].device_type], (error, results) => {
                        if (error) {
                            console.log('deviceStatus Update query error:');
                            console.log(error);
                            return;
                        }
                        //console.log(results);
                    });
                });

            }
        });
    })
    //Application에서 푸시 신청 목록 보기 누르면
    socket.on('view_request', view_requset_data => {
        const { token } = view_requset_data;
        console.log("[App] Push List Request Device Token: " + token)

        connection.query(`SELECT device_id, device_type, state FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            //console.log("socket.io 'request_list' sent");
            //socket.emit('request_list', results);
            application.to(socket.id).emit('request_list', results);
            //console.log(results);
        });
    })
    //Application에서 푸시 신청 제거하면
    socket.on('remove_request', remove_request_data => {
        const { token, device_id } = remove_request_data;
        console.log("[App] Push Cancel Request Device Token: " + token + " Device ID: " + device_id)

        connection.query(`DELETE FROM PushAlert WHERE device_id = ? AND Token = ?;`, [device_id, token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            //console.log(results);
        });

        connection.query(`SELECT device_id, device_type FROM PushAlert WHERE Token = ? ORDER BY device_id;`, [token], function (error, results) {
            if (error) {
                console.log('SELECT Token query error:');
                console.log(error);
                return;
            }
            //console.log("socket.io 'request_list' sent");
            //socket.emit('request_list', results);
            application.to(socket.id).emit('request_list', results);
            //console.log(results);
        });
    })
})

http.listen(http_port, () => {
    console.log(`Listening to port ${http_port}`)
})

https.listen(https_port, () => {
    console.log(`Listening to port ${https_port}`)
})

function Sendto(HWID, data) {
    const arr_index = ConnectedDevice.findIndex(obj => obj.hwid == HWID)
    console.log(arr_index)
    if(arr_index >= 0 && ConnectedDevice[arr_index].ws && ConnectedDevice[arr_index].ws.readyState === ConnectedDevice[arr_index].ws.OPEN)
    ConnectedDevice[arr_index].ws.send(data);
}

function StatusUpdate(id, state) {
    let device_status_str
    if (state == 1) {
        device_status_str = "사용가능"
    } else if (state == 0) {
        device_status_str = "작동중"
    }
    else if (state == 2) {
        device_status_str = "연결 끊어짐"
    }
    if(DiscordConnected == 1)
    {
        const channel = client.channels.cache.get(credential.discord_channelid);
        channel.send(`${id}번 기기의 상태가 "${device_status_str}"으로 변경되었습니다.`);
    }
    //기기상태 DB 업데이트
    connection.query(`UPDATE deviceStatus SET state = ? WHERE id = ?;`, [state, id], (error, results) => {
        if (error) {
            console.log('deviceStatus Update query error:');
            console.log(error);
            return;
        }
        //console.log(results);
    });
    //푸시알림 DB 업데이트
    connection.query(`UPDATE PushAlert SET state = ? WHERE device_id = ?;`, [state, id], (error, results) => {
        if (error) {
            console.log('deviceStatus Update query error:');
            console.log(error);
            return;
        }
        //console.log(results);
    });

    //Application과 Frontend에 현재 상태 DB 넘기기
    connection.query(`SELECT * FROM deviceStatus WHERE id = ?;`, [id], function (error, results) {
        if (error) {
            console.log('SELECT * FROM deviceStatus query error:');
            console.log(error);
            return;
        }
        application.emit('update', results)
        ClientSocket.clients.forEach(function (client) {
            client.send(JSON.stringify(results[0]));
        });
    });

    if (state == 0)//ON
    {
        connection.query(`UPDATE deviceStatus SET ON_time = ? WHERE id = ?;`, [moment().format(), id], (error, results) => {
            if (error) {
                console.log('deviceStatus Update query error:');
                console.log(error);
                return;
            }
            //console.log(results);
        });
    } else if (state == 1) {//OFF
        connection.query(`UPDATE deviceStatus SET OFF_time = ? WHERE id = ?;`, [moment().format(), id], (error, results) => {
            if (error) {
                console.log('deviceStatus Update query error:');
                console.log(error);
                return;
            }

            connection.query(`SELECT ON_time, OFF_time FROM deviceStatus WHERE id = ?;`, [id], function (error, results) {
                if (error) {
                    console.log('SELECT Token query error:');
                    console.log(error);
                    return;
                }
                let hour_diff = moment(results[0].OFF_time).diff(results[0].ON_time, 'hours')
                let minute_diff = moment(results[0].OFF_time).diff(results[0].ON_time, 'minutes') - (hour_diff * 60)
                let second_diff = moment(results[0].OFF_time).diff(results[0].ON_time, 'seconds') - (minute_diff * 60) - (hour_diff * 3600)
                console.log("[Device] Time " + hour_diff + "/" + minute_diff + "/" + second_diff)

                //알림신청 Token 조회해서 FCM 메시지 보내기
                connection.query(`SELECT Token FROM PushAlert WHERE device_id = ? AND Expect_Status = ?;`, [id, state], function (error, results) {
                    let target_tokens = new Array();
                    if (error) {
                        console.log('SELECT Token query error:');
                        console.log(error);
                        return;
                    }
                    //console.log(results);
                    //console.log(results.length);

                    //해당되는 Token 배열형태로 저장
                    for (let i = 0; i < results.length; i++) {
                        target_tokens[i] = results[i].Token;
                    }

                    //해당되는 Token이 없다면 return
                    if (target_tokens == 0) {
                        console.log("[FCM] No push request (" + id + ")");
                        return
                    } else {
                        console.log("[FCM] Push Sent");
                        console.log("[FCM] " + target_tokens);

                        connection.query(`SELECT device_type FROM deviceStatus WHERE id = ?;`, [id], function (error, results) {
                            if (results[0].device_type == "WASH") {
                                //FCM 메시지 내용
                                let message = {
                                    notification: {
                                        title: '세탁기 알림',
                                        body: `${id}번 세탁기의 동작이 완료되었습니다.\r\n동작시간 : ${hour_diff}시간 ${minute_diff}분 ${second_diff}초`,
                                    },
                                    tokens: target_tokens,
                                    android: {
                                        priority: "high"
                                    },
                                    apns: {
                                        payload: {
                                            aps: {
                                                contentAvailable: true,
                                            }
                                        }
                                    }
                                }

                                //FCM 메시지 보내기
                                fcm.messaging().sendMulticast(message)
                                    .then((response) => {
                                        if (response.failureCount > 0) {
                                            const failedTokens = [];
                                            response.responses.forEach((resp, idx) => {
                                                if (!resp.success) {
                                                    failedTokens.push(target_tokens[idx]);
                                                }
                                            });
                                            console.log('[FCM] Failed Token: ' + failedTokens);
                                        }
                                        //console.log('FCM Success')
                                        return
                                    });
                            } else if (results[0].device_type == "DRY") {
                                //FCM 메시지 내용
                                let message = {
                                    notification: {
                                        title: '건조기 알림',
                                        body: `${id}번 건조기의 동작이 완료되었습니다.\r\n동작시간 : ${hour_diff}시간 ${minute_diff}분 ${second_diff}초`,
                                    },
                                    tokens: target_tokens,
                                    android: {
                                        priority: "high"
                                    },
                                    apns: {
                                        payload: {
                                            aps: {
                                                contentAvailable: true,
                                            }
                                        }
                                    }
                                }

                                //FCM 메시지 보내기
                                fcm.messaging().sendMulticast(message)
                                    .then((response) => {
                                        if (response.failureCount > 0) {
                                            const failedTokens = [];
                                            response.responses.forEach((resp, idx) => {
                                                if (!resp.success) {
                                                    failedTokens.push(target_tokens[idx]);
                                                }
                                            });
                                            console.log('[FCM] Failed Token:' + failedTokens);
                                        }
                                        //console.log('FCM Success')
                                        return
                                    });

                            }
                        });

                    }
                });

                //FCM 메시지 보낸 Token 제거
                connection.query(`DELETE FROM PushAlert WHERE device_id = ? AND Expect_Status = ?;`, [id, state], function (error, results) {
                    if (error) {
                        console.log('DELETE Token query error:');
                        console.log(error);
                        return;
                    }
                    //console.log(results);
                });
            })
        });
    }

}