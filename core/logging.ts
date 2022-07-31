import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const transport = new DailyRotateFile({
  filename: 'dexarb-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
})

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [transport],
})

export default logger
