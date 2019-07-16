const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const Chatkit = require("@pusher/chatkit-server");

require("dotenv").config();
const app = express();

const INSTANCE_LOCATOR_ID = process.env.CHATKIT_INSTANCE_LOCATOR_ID;
const CHATKIT_SECRET = process.env.CHATKIT_SECRET_KEY;

const chatkit = new Chatkit.default({
  instanceLocator: INSTANCE_LOCATOR_ID,
  key: CHATKIT_SECRET
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send('all green');
});

app.post("/user", async (req, res) => {
  const { username } = req.body;
  try {
    const users = await chatkit.getUsers();
    const user = users.find((usr) => usr.name == username);
    res.send({ user });
  } catch (get_user_err) {
    console.log("error getting user: ", get_user_err);
  }
});

app.post("/rooms", async (req, res) => {
  const { user_id } = req.body;
  try {
    const rooms = await chatkit.getUserRooms({
      userId: user_id
    });
    rooms.map((item) => {
      item.joined = true;
      return item;
    });

    const joinable_rooms = await chatkit.getUserJoinableRooms({
      userId: user_id
    });
    joinable_rooms.map((item) => {
      item.joined = false;
      return item;
    });

    const all_rooms = rooms.concat(joinable_rooms);

    res.send({ rooms: all_rooms });
  } catch (get_rooms_err) {
    console.log("error getting rooms: ", get_rooms_err);
  }
});

app.post("/user/join", async (req, res) => {
  const { room_id, user_id } = req.body;
  try {
    await chatkit.addUsersToRoom({
      roomId: room_id,
      userIds: [user_id]
    });

    res.send('ok');
  } catch (user_permissions_err) {
    console.log("error getting user permissions: ", user_permissions_err);
  }
});

app.post("/read-cursors", async (req, res) => {
  const { room_id, message_id } = req.body;
  let seen_by = '';

  try {
    const cursors = await chatkit.getReadCursorsForRoom({
      roomId: room_id,
    });

    const read_by_members = cursors.filter(item => item.position == message_id);

    if (read_by_members.length > 0) {
      const members = await chatkit.getUsersById({
        userIds: read_by_members.map(item => item.user_id),
      });

      seen_by = members.map(item => {
        return item.name;
      }).join(', ');
    }

    res.send({
      seen_by
    });

  } catch (err) {
    console.log('read cursor error: ', err);
  }
});


const PORT = 5000;
app.listen(PORT, (err) => {
  if (err) {
    console.error(err);
  } else {
    console.log(`Running on ports ${PORT}`);
  }
});