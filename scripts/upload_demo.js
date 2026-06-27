// scripts/upload_demo.js
// Uploads the final demo video to R2 and patches the Supabase job record.
// Called at the end of the demo_generator.yml workflow.

const fs = require('fs');

const JOB_ID = process.env.JOB_ID;
const DEMO_TYPE = process.env.DEMO_TYPE;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VIDEO_PATH_DESKTOP = `/tmp/demo_final_${DEMO_TYPE}_desktop.mp4`;
const VIDEO_PATH_MOBILE  = `/tmp/demo_final_${DEMO_TYPE}_mobile.mp4`;

async function patchSupabase(data) {
  if (!JOB_ID || !SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

async function uploadToR2(localPath, r2Key) {
  // Use AWS SDK v3 style with fetch + pre-signed approach via @aws-sdk/client-s3
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  const fileBuffer = fs.readFileSync(localPath);

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    Body: fileBuffer,
    ContentType: 'video/mp4',
  }));

  return `${R2_PUBLIC_URL}/${r2Key}`;
}

(async () => {
  try {
    if (!fs.existsSync(VIDEO_PATH_DESKTOP)) throw new Error(`Desktop video not found: ${VIDEO_PATH_DESKTOP}`);
    if (!fs.existsSync(VIDEO_PATH_MOBILE))  throw new Error(`Mobile video not found: ${VIDEO_PATH_MOBILE}`);

    await patchSupabase({ status: 'uploading' });

    const timestamp = Date.now();
    console.log('Uploading desktop...');
    const desktopUrl = await uploadToR2(VIDEO_PATH_DESKTOP, `generated-demos/${DEMO_TYPE}_${timestamp}_desktop.mp4`);
    console.log('Uploading mobile...');
    const mobileUrl  = await uploadToR2(VIDEO_PATH_MOBILE,  `generated-demos/${DEMO_TYPE}_${timestamp}_mobile.mp4`);

    console.log(`Desktop: ${desktopUrl}`);
    console.log(`Mobile:  ${mobileUrl}`);
    await patchSupabase({ status: 'done', final_url: JSON.stringify({ desktop: desktopUrl, mobile: mobileUrl }) });
    console.log('Job complete.');
  } catch (err) {
    console.error('Upload failed:', err.message);
    await patchSupabase({ status: 'error', error: err.message });
    process.exit(1);
  }
})();
