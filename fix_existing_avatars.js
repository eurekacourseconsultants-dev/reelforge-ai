// Run with: node --env-file=.env.local /tmp/fix_existing_avatars.js
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

const AVATARS_DIR = '/Users/petermoss/Downloads/reelforge-ai/ReelForge-AI/avatars'

// cafe-female-29-01.jpg only exists in R2, not locally — we'll fetch it via its public URL instead
const FILES = [
  { name: 'hdb-office-female-20s-01.jpg', source: 'local' },
  { name: 'hdb-office-male-20s-01.jpg',   source: 'local' },
  { name: 'cafe-female-29-01.jpg',        source: 'remote' },
  { name: 'cafe-male-29-01.jpg',          source: 'local' },
]

async function uploadToR2(key, buffer, contentType = 'image/jpeg') {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  })
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return `${R2_PUBLIC_URL}/${key}`
}

async function fetchRemote(url) {
  const res = await fetch(url)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

;(async () => {
  for (const file of FILES) {
    console.log(`\n--- ${file.name} ---`)
    let rawBuffer
    if (file.source === 'local') {
      const localPath = path.join(AVATARS_DIR, file.name)
      if (!fs.existsSync(localPath)) {
        console.log(`SKIPPED — not found locally at ${localPath}`)
        continue
      }
      rawBuffer = fs.readFileSync(localPath)
    } else {
      const remoteUrl = `${R2_PUBLIC_URL}/avatars/${file.name}`
      console.log(`Fetching from R2: ${remoteUrl}`)
      rawBuffer = await fetchRemote(remoteUrl)
    }

    try {
      const jpegBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer()
      const localOutPath = path.join(AVATARS_DIR, file.name)
      fs.writeFileSync(localOutPath, jpegBuffer)
      console.log(`Converted and saved locally: ${localOutPath}`)

      const r2Url = await uploadToR2(`avatars/${file.name}`, jpegBuffer)
      console.log(`Re-uploaded to R2: ${r2Url}`)
    } catch (err) {
      console.log(`FAILED: ${err.message}`)
    }
  }
  console.log('\nDone.')
})()
