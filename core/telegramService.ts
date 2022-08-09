import { Telegraf } from 'telegraf'
import 'dotenv/config'
import logger from './logging'

class TelegramBot {
  public telegramBot: Telegraf

  constructor() {
    this.telegramBot = new Telegraf(process.env.BOT_TOKEN ?? '')
    this.initialiseTelegramBot()
  }

  private initialiseTelegramBot() {
    this.telegramBot.start((ctx) => {
      logger.info('/start is called')
      ctx.reply('Welcome')
    })

    this.telegramBot.help((ctx) => {
      logger.info('/help is called', ctx.update)
      ctx.reply('Send me a sticker')
    })

    this.telegramBot.on('sticker', (ctx) => ctx.reply('👍'))
    this.telegramBot.hears('hi', (ctx) => ctx.reply('Hey there'))
    this.telegramBot.launch()

    // Enable graceful stop
    process.once('SIGINT', () => this.telegramBot.stop('SIGINT'))
    process.once('SIGTERM', () => this.telegramBot.stop('SIGTERM'))
  }

  public sendMessage(message: string, telegramId = process.env.DEFAULT_TELEGRAM_ID ?? '') {
    this.telegramBot.telegram.sendMessage(telegramId, message)
  }
}

export const telegramBot = new TelegramBot()
