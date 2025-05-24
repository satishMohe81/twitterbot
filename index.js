const { TwitterApi } = require('twitter-api-v2');
const translate = require('google-translate-api');
const fs = require('fs');

// Config - these will come from Railway environment variables
const config = {
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token: process.env.ACCESS_TOKEN,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
  bearer_token: process.env.BEARER_TOKEN,
  source_user: process.env.SOURCE_USER,
  target_user: process.env.TARGET_USER
};

// Initialize Twitter client
const client = new TwitterApi({
  appKey: config.consumer_key,
  appSecret: config.consumer_secret,
  accessToken: config.access_token,
  accessSecret: config.access_token_secret
});

const rwClient = client.readWrite;
const bearerClient = new TwitterApi(config.bearer_token).readOnly;

// File to store last processed tweet ID
const LAST_TWEET_FILE = 'lastTweetId.txt';

async function getLastTweetId() {
  try {
    return fs.readFileSync(LAST_TWEET_FILE, 'utf-8').trim();
  } catch (err) {
    return null;
  }
}

function saveLastTweetId(tweetId) {
  fs.writeFileSync(LAST_TWEET_FILE, tweetId.toString());
}

async function translateToHindi(text) {
  try {
    const res = await translate(text, { from: 'en', to: 'hi' });
    return res.text;
  } catch (err) {
    console.error('Translation error:', err);
    return null;
  }
}

async function postTranslatedTweet(tweetText, originalTweetUrl) {
  try {
    const translatedText = await translateToHindi(tweetText);
    if (!translatedText) return false;

    const finalText = `${translatedText}\n\n(स्रोत: ${originalTweetUrl})`;
    
    await rwClient.v2.tweet(finalText);
    console.log('Posted translated tweet');
    return true;
  } catch (err) {
    console.error('Error posting tweet:', err);
    return false;
  }
}

async function checkNewTweets() {
  const lastTweetId = await getLastTweetId();
  const params = { 
    exclude: ['replies', 'retweets'],
    max_results: 5
  };

  if (lastTweetId) {
    params.since_id = lastTweetId;
  }

  try {
    const timeline = await bearerClient.v2.userTimeline(config.source_user, params);
    
    if (timeline.tweets.length > 0) {
      // Process from oldest to newest
      for (const tweet of timeline.tweets.reverse()) {
        console.log(`Processing tweet ${tweet.id}`);
        const tweetUrl = `https://twitter.com/${config.source_user}/status/${tweet.id}`;
        
        if (await postTranslatedTweet(tweet.text, tweetUrl)) {
          saveLastTweetId(tweet.id);
          // Wait to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }
  } catch (err) {
    console.error('Error fetching tweets:', err);
  }
}

async function main() {
  while (true) {
    console.log('Checking for new tweets...');
    await checkNewTweets();
    // Wait 5 minutes between checks
    await new Promise(resolve => setTimeout(resolve, 300000));
  }
}

main().catch(console.error);
