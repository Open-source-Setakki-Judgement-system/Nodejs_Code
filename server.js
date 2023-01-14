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
})