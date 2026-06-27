const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

;(async () => {
  const filePath = process.argv[2]
  const key = process.argv[3]
  if (!filePath || !key) {
    console.error('Usage: node upload_voice_ref.js <filePath> <r2Key>')
    process.exit(1)
  }
  const body = fs.readFileSync(filePath)
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: 'audio/mpeg',
  }))
  console.log('Uploaded to R2:', key)
})()
