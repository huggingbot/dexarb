import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const { combine, timestamp, errors, printf } = winston.format

const transport = new DailyRotateFile({
  filename: 'dexarb-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
})

const myFormat = printf(({ level, message, label, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} [${label}] ${level}: ${message} ${stack}`
  }
  return `${timestamp} [${label}] ${level}: ${message}`
})

const logger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), errors({ stack: true }), myFormat),
  transports: [transport],
})

export default logger
