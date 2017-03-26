import test from 'ava';
import request from 'request-promise';
import { assign } from 'lodash';
import { outgoingMessageFixtures,
         incomingUpdateFixtures } from 'botmaster-test-fixtures';

import Botmaster from '../../lib';
import MockBot from '../_mock_bot';

test.beforeEach((t) => {
  return new Promise((resolve) => {
    t.context.botmaster = new Botmaster();
    t.context.bot = new MockBot({
      requiresWebhook: true,
      webhookEndpoint: 'webhook',
      type: 'express',
    });
    t.context.botmaster.addBot(t.context.bot);
    t.context.baseRequestOptions = {
      method: 'POST',
      uri: 'http://localhost:3000/express/webhook',
      body: {},
      json: true,
      resolveWithFullResponse: true,
    };
    t.context.botmaster.on('listening', resolve);
  });
});

test.afterEach((t) => {
  return new Promise((resolve) => {
    t.context.botmaster.server.close(resolve);
  });
});

test('throws an error if type is not incoming or outgoing', (t) => {
  t.plan(1);

  try {
    t.context.botmaster.use({
      type: 'something',
    });
  } catch (err) {
    t.is(err.message,
      'invalid middleware type. Type should be either \'incoming\' or \'outgoing\'',
      'Error message is not the same as expected');
  }
});

test('throws an error if controller is not defined', (t) => {
  t.plan(1);

  try {
    t.context.botmaster.use({
      type: 'incoming',
    });
  } catch (err) {
    t.is(err.message,
      'middleware controller can\'t be of type undefined. It needs to be a function',
      'Error message is not the same as expected');
  }
});

test('throws an error if middlewareCallback is not a function', (t) => {
  t.plan(1);

  try {
    t.context.botmaster.use({
      type: 'incoming',
      controller: 'not valid',
    });
  } catch (err) {
    t.is(err.message,
      'middleware controller can\'t be of type string. It needs to be a function',
      'Error message is not the same as expected');
  }
});

test('Errors in incoming middleware are emitted correctly', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    const botmaster = t.context.botmaster;

    botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        update.blop();
        next();
      },
    });

    botmaster.on('error', (bot, err) => {
      t.is(err.message,
        '"update.blop is not a function". This is most probably on your end.',
        'Error message did not match');
      resolve();
    });

    t.context.baseRequestOptions.body = { text: 'Change this' };
    request(t.context.baseRequestOptions);
  });
});

test('sets up the incoming middleware function specified if good params passed. Does not call any outgoing middleware when going through', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    const botmaster = t.context.botmaster;

    botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        update.message.text = 'Hello World!';
        next();
      },
    });

    botmaster.use({
      type: 'outgoing',
      controller: () => {
        t.fail('outgoing middleware should not be called');
      },
    });

    botmaster.use({
      type: 'incoming',
      controller: (bot, update) => {
        t.is(update.message.text, 'Hello World!', 'update object did not match');
        resolve();
      },
    });

    t.context.baseRequestOptions.body = { text: 'Change this' };
    request(t.context.baseRequestOptions);
  });
});

test('sets up the incoming middleware function specified if all is setup correctly and use is specified before addBot', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    const botmaster = t.context.botmaster;

    botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        update.message.text = 'Hello World!';
        next();
      },
    });

    // easiest way to "add" bot after a use
    botmaster.removeBot(t.context.bot);
    botmaster.addBot(t.context.bot);

    botmaster.use({
      type: 'incoming',
      controller: (bot, update) => {
        t.is(update.message.text, 'Hello World!', 'update object did not match');
        resolve();
      },
    });

    t.context.baseRequestOptions.body = { text: 'Change this' };
    request(t.context.baseRequestOptions);
  });
});

test('sets up the incoming middleware in standalone and calls them using __emitUpdate', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    t.context.botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        update.text = 'Hello World!';
        next();
      },
    });

    t.context.botmaster.use({
      type: 'incoming',
      controller: (bot, update) => {
        t.is(update.text, 'Hello World!', 'update object did not match');
        resolve();
      },
    });

    t.context.bot.__emitUpdate({ text: 'Change this' });
  });
});


test.only('sets up the incoming middleware in order of declaration', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    t.context.botmaster.use({
      type: 'incoming',
      controller: async (bot, update, next) => {
        update.text = 'Hello World!';
        next();
      },
    });

    t.context.botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        update.text += ' And others';
        next();
      },
    });

    t.context.botmaster.use({
      type: 'incoming',
      controller: (bot, update) => {
        t.is(update.text, 'Hello World! And others', 'update object did not match');
        resolve();
      },
    });

    t.context.bot.__emitUpdate({ text: 'Change this' });
  });
});

test.only('using skip in incoming middleware works as expected', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    t.context.botmaster.use({
      type: 'incoming',
      controller: (bot, update, next) => {
        next('skip');
      },
    });

    t.context.botmaster.use({
      type: 'incoming',
      controller: () => {
        t.fail('this should not get hit');
      },
    });

    // I'm guessing this should take less time if the second middleware were to
    // get hit
    setTimeout(() => {
      t.pass();
      resolve();
    }, 50);


    t.context.bot.__emitUpdate({ text: 'Change this' });
  });
});


test.only('echo, read and delivery are not included by default', (t) => {
  // TODO, update botmaster-test-fictures first
  t.plan(3);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot({
      type: 'dontIncludeMe',
      receives: {
        text: true,
        echo: true,
      },
      sends: {
        text: true,
        quickReply: true,
      },
    }));
    botmaster.addBot(new MockBot({
      type: 'includeMe',
      receives: {
        echo: true,
      },
      sends: {
        text: true,
        quickReply: true,
      },
    }));
    botmaster.addBot(new MockBot({
      type: 'excludeMe',
      receives: {
        text: true,
        echo: true,
      },
      sends: {
        text: true,
      },
      retrievesUserInfo: true,
    }));

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          update.number += 1;
          next();
        },
        options: {
          botTypesToInclude: 'includeMe',
        },
      },
    });

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          update.number += 10;
          next();
        },
        options: {
          botTypesToExclude: 'excludeMe',
        },
      },
    });

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          update.number += 100;
          next();
        },
        options: {
          botReceives: 'text',
        },
      },
    });

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          update.number += 1000;
          next();
        },
        options: {
          botSends: 'quickReply',
        },
      },
    });

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          update.number += 10000;
          next();
        },
        options: {
          botRetrievesUserInfo: true,
        },
      },
    });

    let passes = 0;
    botmaster.on('update', (bot, update) => {
      passes += 1;
      if (bot.type === 'dontIncludeMe') {
        t.is(update.number, 1110, 'update object did not match for includeMe');
      } else if (bot.type === 'includeMe') {
        t.is(update.number, 1011, 'update object did not match for excludeMe');
      } else if (bot.type === 'excludeMe') {
        t.is(update.number, 100, 'update object did not match for dontIncludeMe');
      }

      if (passes === 3) {
        botmaster.server.close(resolve);
      }
    });

    botmaster.on('listening', () => {
      // inside of here just to make sure I don't close a server
      // that is not listening yet
      for (const bot of botmaster.bots) {
        bot.__emitUpdate({ number: 0 });
      }
    });
  });
});

test('Errors in outgoing middleware are emitted correctly', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    botmaster.use({
      outgoing: {
        cb: (bot, message, next) => {
          message.blop();
          next();
        },
      },
    });

    botmaster.on('listening', () => {
      botmaster.bots[0].sendMessage({ text: 'Change this' })
      .catch((err) => {
        t.is(err.message,
            '"message.blop is not a function". In outgoing middleware',
            'Error message did not match');
        botmaster.server.close(resolve);
      });
    });
  });
});

test('sets up the outgoing middleware in order of declaration. Then calls them when prompted without calling incoming middleware', (t) => {
  t.plan(1);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    botmaster.use({
      incoming: {
        cb: (bot, update, next) => {
          t.fail('Called incoming middleware, although should not');
          next();
        },
      },
    });

    botmaster.use({
      outgoing: {
        cb: (bot, message, next) => {
          message.removeText();
          next();
        },
      },
    });

    botmaster.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          message.addText('Goodbye Worlds!');
          next();
        },
      },
    });

    botmaster.on('listening', () => {
      botmaster.bots[0].sendMessage(outgoingMessageFixtures.textMessage())
      .then((body) => {
        t.is(body.sentOutgoingMessage.message.text, 'Goodbye Worlds!', 'sent message did not match');
        botmaster.server.close(resolve);
      })
      .catch((err) => {
        t.fail(err.message);
        botmaster.server.close(resolve);
      });
    });
  });
});

test('sets up the outgoing middleware in order of declaration and skips if specified so', (t) => {
  t.plan(3);

  return new Promise(async (resolve) => {
    const bot = new MockBot();

    let pass = 1;
    bot.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          message.message.text = 'Hello World!';
          if (pass === 1) {
            pass += 1;
            return next('skip');
          } else if (pass === 2) {
            return next('skipAllOutgoing');
          }

          return next('skipNonWrappedOutgoingOnly');
        },
      },
    });

    bot.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          t.fail('Should have been skipped');
          next();
        },
      },
    });

    bot.on('error', (err) => {
      t.fail(err.message);
      resolve();
    });

    try {
      const body1 = await bot.sendTextMessageTo('Change this', 'user_id');
      t.is(body1.sentOutgoingMessage.message.text, 'Hello World!');

      const body2 = await bot.sendTextMessageTo('Change this again', 'user_id');
      t.is(body2.sentOutgoingMessage.message.text, 'Hello World!');

      const body3 = await bot.sendTextMessageTo('Change this again 2', 'user_id');
      t.is(body3.sentOutgoingMessage.message.text, 'Hello World!');

      resolve();
    } catch (err) {
      t.fail(err.message);
      resolve();
    }

    bot.sendTextMessageTo('Change this', 'user_id');
  });
});

test('sets up the outgoing middleware which is ignored if specified so in sendOptions.', (t) => {
  t.plan(2);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    botmaster.use({
      outgoing: {
        cb: (bot, message, next) => {
          t.fail('outgoing middleware should not be called');
          next();
        },
      },
    });

    botmaster.on('listening', async () => {
      const bot = botmaster.bots[0];
      try {
        await bot.sendMessage(
          outgoingMessageFixtures.textMessage(), { ignoreMiddleware: true });
        await bot.reply(
          incomingUpdateFixtures.textUpdate(), 'wadup?', { ignoreMiddleware: true });
        await bot.sendAttachmentFromUrlTo(
          'image', 'some_link', 'user_id', { ignoreMiddleware: true });
        await bot.sendDefaultButtonMessageTo(
          ['b1', 'b2'], undefined, 'user_id', { ignoreMiddleware: true });
        await bot.sendIsTypingMessageTo(
          'user_id', { ignoreMiddleware: true });
        const bodies = await bot.sendTextCascadeTo(
          ['message1', 'message2'], 'user_id', { ignoreMiddleware: true });

        t.is(bodies[0].sentOutgoingMessage.message.text, 'message1',
          'sentOutgoingMessage was not as expected');
        t.is(bodies[1].sentOutgoingMessage.message.text, 'message2',
          'sentOutgoingMessage was not as expected');

        botmaster.server.close(resolve);
      } catch (err) {
        t.fail(err.message);
        botmaster.server.close(resolve);
      }
    });
  });
});

test('sets up the outgoing middleware which is aware of update when manually set using sendOptions. or __createBotPatchedWithUpdate', (t) => {
  t.plan(4);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    const mockUpdate = { id: 1 };

    botmaster.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          t.is(update, mockUpdate, 'associated update is not the same');
          t.deepEqual(assign({}, message), outgoingMessageFixtures.textMessage(), 'Message is not the same');
          next();
        },
      },
    });

    botmaster.on('listening', async () => {
      const bot = botmaster.bots[0];
      try {
        await bot.sendMessage(
          outgoingMessageFixtures.textMessage(), { __update: mockUpdate });

        // with a patchedBot
        const patchedBot = bot.__createBotPatchedWithUpdate(mockUpdate);
        await patchedBot.sendMessage(outgoingMessageFixtures.textMessage());

        botmaster.server.close(resolve);
      } catch (err) {
        t.fail(err.message);
        botmaster.server.close(resolve);
      }
    });
  });
});

test('sets up the outgoing middleware which is aware of update when sending message from incoming middleware', (t) => {
  t.plan(3);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    botmaster.use({
      incoming: {
        cb: async (bot, update, next) => {
          const body = await bot.reply(update, 'Hello World!');
          t.is(body.sentOutgoingMessage.message.text, 'Hello World!');
          botmaster.server.close(resolve);
        },
      },
    });

    botmaster.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          t.deepEqual(assign({}, update), incomingUpdateFixtures.textUpdate(), 'associated update is not the same');
          t.deepEqual(assign({}, message), outgoingMessageFixtures.textMessage(), 'Message is not the same');
          next();
        },

      },
    });

    botmaster.on('listening', async () => {
      const bot = botmaster.bots[0];
      bot.__emitUpdate(incomingUpdateFixtures.textUpdate());
    });
  });
});

test('sets up the outgoing middleware which is aware of update when sending message from on update handler', (t) => {
  t.plan(3);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    botmaster.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          t.deepEqual(assign({}, update), incomingUpdateFixtures.textUpdate(), 'associated update is not the same');
          t.deepEqual(assign({}, message), outgoingMessageFixtures.textMessage(), 'Message is not the same');
          next();
        },
      },
    });

    botmaster.on('update', async (bot, update) => {
      const body = await bot.reply(update, 'Hello World!');
      t.is(body.sentOutgoingMessage.message.text, 'Hello World!');
      botmaster.server.close(resolve);
    });

    botmaster.on('listening', async () => {
      const bot = botmaster.bots[0];
      bot.__emitUpdate(incomingUpdateFixtures.textUpdate());
    });
  });
});

test('sets up the outgoing middleware which is aware of update on the second pass when sending a message in outgoing middleware', (t) => {
  t.plan(6);

  return new Promise((resolve) => {
    const botmaster = new Botmaster();
    botmaster.addBot(new MockBot());

    const receivedUpdate = incomingUpdateFixtures.textUpdate();

    let pass = 1;
    botmaster.use({
      outgoing: {
        cb: (bot, update, message, next) => {
          if (pass === 1) {
            t.is(message.message.text, 'Hello World!', 'message text is not as expected on first pass');
            t.is(update.newProp, 1, 'newProp is not the expected value on first pass');
            t.is(update, receivedUpdate, 'Reference to update is not the same');
            update.newProp = 2;
            pass += 1;

            bot.reply(update, 'Goodbye World!');
          } else if (pass === 2) {
            t.is(message.message.text, 'Goodbye World!', 'message text is not as expected on second pass');
            t.is(update.newProp, 2, 'newProp is not the expected value on second pass');
            t.is(update, receivedUpdate, 'Reference to update is not the same');
            botmaster.server.close(resolve);
          }
          next();
        },
      },
    });

    botmaster.on('update', (bot, update) => {
      update.newProp = 1;
      bot.reply(update, 'Hello World!');
    });

    botmaster.on('listening', async () => {
      const bot = botmaster.bots[0];
      bot.__emitUpdate(receivedUpdate);
    });
  });
});

