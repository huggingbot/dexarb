import { Telegraf } from 'telegraf';
import 'dotenv/config';

const telegramBot = new Telegraf(process.env.BOT_TOKEN ?? "");

telegramBot.start((ctx) => {
    console.log("/start is called")
    ctx.reply('Welcome')
});

telegramBot.help((ctx) => {
    console.log("/help is called", ctx.update)
    ctx.reply('Send me a sticker')
});

telegramBot.on('sticker', (ctx) => ctx.reply('👍'));
telegramBot.hears('hi', (ctx) => ctx.reply('Hey there'));
telegramBot.launch();

// Enable graceful stop
process.once('SIGINT', () => telegramBot.stop('SIGINT'))
process.once('SIGTERM', () => telegramBot.stop('SIGTERM'))

