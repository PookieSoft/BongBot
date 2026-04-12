const username = process.argv[2] || process.env.TIKTOK_USERNAME;

if (!username) {
    console.log('Usage: npx tsx test_live_check.ts <tiktok_username>');
    process.exit(1);
}

console.log(`Checking live status for @${username}...`);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

const response = await fetch(`https://www.tiktok.com/@${username}`, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    signal: controller.signal
});

clearTimeout(timeout);

if (!response.ok) {
    console.log(`Profile fetch failed with status ${response.status}`);
    process.exit(1);
}

const html = await response.text();
const scriptMatch = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);

if (!scriptMatch) {
    console.log('Could not find rehydration data in profile page.');
    process.exit(1);
}

const data = JSON.parse(scriptMatch[1]);
const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
const user = userDetail?.userInfo?.user;

if (!user) {
    console.log('Could not parse user data from profile.');
    process.exit(1);
}
console.log(user);
const roomId = user.roomId;
const isLive = !!roomId && roomId !== '0';
const avatarUrl = user.avatarLarger ?? user.avatarMedium ?? null;

console.log({
    username: user.uniqueId ?? username,
    nickname: user.nickname ?? 'unknown',
    isLive,
    roomId: roomId || '(none)',
    avatarUrl: avatarUrl ? avatarUrl.substring(0, 80) + '...' : '(none)',
});
