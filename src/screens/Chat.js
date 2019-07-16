import React, { Component } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { GiftedChat, Bubble } from 'react-native-gifted-chat';
import { ChatManager, TokenProvider } from '@pusher/chatkit-client';
import Config from 'react-native-config';
import axios from 'axios';

const CHAT_SERVER = "YOUR NGROK HTTPS URL";

const CHATKIT_INSTANCE_LOCATOR_ID = Config.CHATKIT_INSTANCE_LOCATOR_ID;
const CHATKIT_SECRET_KEY = Config.CHATKIT_SECRET_KEY;
const CHATKIT_TOKEN_PROVIDER_ENDPOINT = Config.CHATKIT_TOKEN_PROVIDER_ENDPOINT;

function get_r_percent_last(arr, percent) {
  const count = arr.length * (percent / 100);
  return arr.slice(0, Math.round(count) + 2).pop();
}

class Chat extends Component {

  state = {
    messages: [],
    show_load_earlier: false,
    is_loading: true
  };


  static navigationOptions = ({ navigation }) => {
    const { params } = navigation.state;
    return {
      headerTitle: params.room_name
    };
  };
  //

  constructor(props) {
    super(props);
    const { navigation } = this.props;

    this.user_id = navigation.getParam("user_id");
    this.room_id = navigation.getParam("room_id");
  }


  async componentDidMount() {
    try {
      const chatManager = new ChatManager({
        instanceLocator: CHATKIT_INSTANCE_LOCATOR_ID,
        userId: this.user_id,
        tokenProvider: new TokenProvider({ url: CHATKIT_TOKEN_PROVIDER_ENDPOINT })
      });

      let currentUser = await chatManager.connect();
      this.currentUser = currentUser;

      await this.currentUser.subscribeToRoomMultipart({
        roomId: this.room_id,
        hooks: {
          onMessage: this.onReceive
        },
        messageLimit: 10
      });

      await this.setState({
        is_loading: false
      });

    } catch (chat_mgr_err) {
      console.log("error with chat manager: ", chat_mgr_err);
    }
  }


  onReceive = async (data) => {
    const { message } = await this.getMessage(data);
    await this.setState((previousState) => ({
      messages: GiftedChat.append(previousState.messages, message)
    }));

    if (this.state.messages.length > 9) {
      this.setState({
        show_load_earlier: true
      });
    }
  }


  getMessage = async ({ id, sender, parts, createdAt }) => {
    const text = parts.find(part => part.partType === 'inline').payload.content;

    let msg_data = {
      _id: id,
      text: text,
      createdAt: new Date(createdAt),
      user: {
        _id: sender.id,
        name: sender.name,
        avatar: `https://ui-avatars.com/api/?background=d88413&color=FFF&name=${sender.name}`
      }
    };

    return {
      message: msg_data
    };
  }
  //


  render() {
    const { messages, is_loading, show_load_earlier } = this.state;
    return (
      <View style={{flex: 1}}>
        {
          is_loading && <ActivityIndicator size="small" color="#0000ff" />
        }
        <GiftedChat
          messages={messages}
          onSend={messages => this.onSend(messages)}
          user={{
            _id: this.user_id
          }}
          loadEarlier={show_load_earlier}
          onLoadEarlier={this.loadEarlierMessages}

          onLongPress={this.onLongPressMessage}
          renderBubble={this.renderBubble}

          listViewProps={{
            scrollEventThrottle: 1000,
            onScroll: async ({ nativeEvent }) => {
              const percent = Math.round((nativeEvent.contentOffset.y / nativeEvent.contentSize.height) * 100);
              const last_message = get_r_percent_last(this.state.messages, percent);

              await this.currentUser.setReadCursor({
                roomId: this.room_id,
                position: last_message._id
              });
            }
          }}
        />
      </View>
    );
  }
  //


  renderBubble = (bubbleProps) => {
    const seen_by_users = bubbleProps.currentMessage.seen_by ? bubbleProps.currentMessage.seen_by : '';
    const view_style = seen_by_users ? { paddingBottom: 5 } : {};
    return (
        <View style={view_style}>
          <Bubble {...bubbleProps} />
          <Text style={styles.small_text}>{ seen_by_users }</Text>
        </View>
    );
  }
  //


  onLongPressMessage = async (context, message) => {
    try {
      const response = await axios.post(
        `${CHAT_SERVER}/read-cursors`,
        {
          room_id: this.room_id,
          message_id: message._id
        }
      );

      this.setState(state => {
        const messages = state.messages.map((item) => {
          if (item._id == message._id) {
            return { ...item, seen_by: response.data.seen_by };
          } else {
            return { ...item, seen_by: '' };
          }
        });

        return {
          messages
        }
      });
    } catch (err) {
      console.log('error getting cursor: ', err);
    }
  }


  asyncForEach = async (array, callback) => {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }


  onSend = async ([message]) => {
    const message_parts = [
      { type: "text/plain", content: message.text }
    ];

    try {
      await this.currentUser.sendMultipartMessage({
        roomId: this.room_id,
        parts: message_parts
      });

    } catch (send_msg_err) {
      console.log("error sending message: ", send_msg_err);
    }
  }


  loadEarlierMessages = async () => {
    this.setState({
      is_loading: true
    });

    const earliest_message_id = Math.min(
      ...this.state.messages.map(m => parseInt(m._id))
    );

    try {
      let messages = await this.currentUser.fetchMultipartMessages({
        roomId: this.room_id,
        initialId: earliest_message_id,
        direction: "older",
        limit: 10
      });

      if (!messages.length) {
        this.setState({
          show_load_earlier: false
        });
      }

      let earlier_messages = [];
      await this.asyncForEach(messages, async (msg) => {
        let { message } = await this.getMessage(msg);
        earlier_messages.push(message);
      });

      await this.setState(previousState => ({
        messages: previousState.messages.concat(earlier_messages)
      }));
    } catch (err) {
      console.log("error occured while trying to load older messages", err);
    }

    await this.setState({
      is_loading: false
    });
  }
}


const styles = StyleSheet.create({
  small_text: {
    fontSize: 10,
    color: '#5d5d5d'
  }
});

export default Chat;