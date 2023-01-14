const dbsettings = require('./var.js');
const express = require('express')
const cors = require('cors')
var mysql = require('mysql');
const app = express()
app.use(cors())
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const port = 3000

var connection = mysql.createConnection({
    host: dbsettings.host,
    user: dbsettings.user,
    password: dbsettings.pw,
    database: dbsettings.db
});

connection.connect();

http.listen(port, () => {
    console.log(`Listening to port ${port}`)
})

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

io.on('connection', socket => {
    console.log('connected', socket.id)

    socket.on('update_state', state_data => {
        console.log(state_data)
        const stateJSON = JSON.stringify(state_data)
        const parsedstate = JSON.parse(stateJSON)
        console.log(parsedstate.id)
        console.log(parsedstate.state)
        connection.query(`UPDATE deviceStatus SET state = ${parsedstate.state} WHERE id =${parsedstate.id};`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        //io.emit('msg', 'Halo')
    })

    socket.on('request_push', push_data => {
        console.log(push_data)
        const pushJSON = JSON.stringify(push_data)
        const parsedpush = JSON.parse(pushJSON)
        console.log(parsedpush.token)
        console.log(parsedpush.device_id)
        console.log(parsedpush.expect_state)
        connection.query(`INSERT INTO PushAlert (Token, device_id, Expect_Status) VALUES (${parsedpush.token},${parsedpush.device_id},${parsedpush.expect_state})`, function (error, results, fields) {
            if (error) {
                console.log(error);
            }
            console.log(results);
        });
        //io.emit('msg', 'Halo')
    })
})