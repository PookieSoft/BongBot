import { ExtendedClient } from '../helpers/interfaces.js';
import { EmbedBuilder, Colors } from 'discord.js';
import cron from 'node-schedule';

interface Logger {
    log(message: string | Error): void;
}

interface ProfileData {
    isLive: boolean;
    avatarUrl: string | null;
}

export default class TikTokLiveNotifier {
    #client?: ExtendedClient;
    #logger?: Logger;
    #card?: EmbedBuilder;
    #dayCheck?: Map<string, boolean>;
    #channels?: string[];
    #tiktokUsername?: string;
    #config?: {
        liveDisplayName: string;
        liveStartTime: string;
        liveEndTime: string;
        twitchStream?: string;
        twitchUsername?: string;
        instaStream?: string;
        instaUsername?: string;
    };

    constructor(client: ExtendedClient, logger: Logger) {
        const tiktokUsername = process.env.TIKTOK_USERNAME;
        if (!tiktokUsername) {
            return;
        }

        this.#config = this.#validateConfig();
        this.#tiktokUsername = tiktokUsername;
        this.#channels = process.env.TIKTOK_LIVE_CHANNEL_IDS?.split(',').filter((id) => id.trim());
        this.#logger = logger;
        this.#client = client;
        this.#dayCheck = new Map<string, boolean>();

        const liveNotif = this.#buildNotificationMessage();

        this.#card = new EmbedBuilder()
            .setTitle('🎵 Live Notification')
            .setColor(Colors.Purple)
            .addFields({ name: `⏱️ ${this.#config.liveDisplayName} is live!`, value: liveNotif, inline: false })
            .setFooter({
                text: `BongBot • ${this.#client.version}`,
                iconURL: this.#client.user?.displayAvatarURL(),
            });

        const cronPattern = `*/1 ${this.#config.liveStartTime}-${this.#config.liveEndTime} * * *`;
        cron.scheduleJob(cronPattern, () => {
            this.#checkLive();
        });
    }

    #validateConfig() {
        const liveDisplayName = process.env.LIVE_DISPLAY_NAME;
        const liveStartTime = process.env.LIVE_START_TIME || '15';
        const liveEndTime = process.env.LIVE_END_TIME || '18';

        if (!liveDisplayName) {
            throw new Error('LIVE_DISPLAY_NAME environment variable is required');
        }

        if (!/^\d{1,2}$/.test(liveStartTime) || !/^\d{1,2}$/.test(liveEndTime)) {
            throw new Error('LIVE_START_TIME and LIVE_END_TIME must be valid hour numbers (0-23)');
        }

        const start = parseInt(liveStartTime, 10);
        const end = parseInt(liveEndTime, 10);
        if (start < 0 || start > 23 || end < 0 || end > 23) {
            throw new Error('LIVE_START_TIME and LIVE_END_TIME must be between 0 and 23');
        }

        return {
            liveDisplayName,
            liveStartTime,
            liveEndTime,
            twitchStream: process.env.TWITCH_STREAM,
            twitchUsername: process.env.TWITCH_USERNAME,
            instaStream: process.env.INSTA_STREAM,
            instaUsername: process.env.INSTA_USERNAME,
        };
    }

    #buildNotificationMessage(): string {
        const lives = [];
        lives.push(`[TikTok](https://www.tiktok.com/@${this.#tiktokUsername!}/live)`);
        if (this.#config!.twitchStream) {
            lives.push(`[Twitch](https://www.twitch.tv/${this.#config!.twitchUsername})`);
        }
        if (this.#config!.instaStream) {
            lives.push(`[Instagram](https://www.instagram.com/${this.#config!.instaUsername}/live)`);
        }
        const liveString = lives.join(', ').replace(/, ([^,]+)$/, ' or $1');
        return `Watch on ${liveString} now!`;
    }

    async #checkLive(): Promise<void> {
        const today: string = new Date().toLocaleDateString();

        if (!this.#dayCheck!.has(today)) {
            this.#dayCheck!.clear();
            this.#dayCheck!.set(today, false);
        }

        if (this.#dayCheck!.get(today)) {
            return;
        }

        try {
            const profile = await fetchProfileData(this.#tiktokUsername!);
            if (!profile.isLive) {
                return;
            }

            this.#dayCheck!.set(today, true);

            if (!this.#channels || this.#channels.length === 0) {
                throw new Error('No Channel IDs found in environment variable TIKTOK_LIVE_CHANNEL_IDS.');
            }

            if (profile.avatarUrl) {
                this.#card!.setThumbnail(profile.avatarUrl);
            }

            for (const channelId of this.#channels) {
                await this.#sendToChannel(channelId);
            }
        } catch (err) {
            this.#logger!.log('Error occurred attempting to get Live Status');
            this.#logger!.log(err instanceof Error ? err : new Error(String(err)));
            this.#dayCheck!.set(today, true);
        }
    }

    async #sendToChannel(channelId: string): Promise<void> {
        try {
            const channel = await this.#client!.channels.fetch(channelId);

            if (!channel || !channel.isTextBased()) {
                this.#logger!.log('Error: Channel not found or is not a text-based channel.');
                return;
            }

            if (!('send' in channel && typeof channel.send === 'function')) {
                this.#logger!.log('Error: Bot does not have permission to send messages in the channel.');
                return;
            }

            this.#card!.setTimestamp();
            await channel.send({
                content: '@everyone',
                embeds: [this.#card!],
                allowedMentions: { parse: ['everyone'] },
            });
        } catch (err) {
            this.#logger!.log(
                `Error sending to channel ${channelId}: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }
}

async function fetchProfileData(username: string): Promise<ProfileData> {
    try {
        const controller = new AbortController();
        /* istanbul ignore next -- @preserve timeout callback only fires if fetch takes >5s */
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`https://www.tiktok.com/@${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            return { isLive: false, avatarUrl: null };
        }

        const html = await response.text();

        const scriptMatch = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
        if (!scriptMatch) {
            return { isLive: false, avatarUrl: null };
        }

        const data = JSON.parse(scriptMatch[1]);
        const userDetail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const user = userDetail?.userInfo?.user;

        const avatarUrl = user?.avatarLarger ?? user?.avatarMedium ?? null;
        const roomId = user?.roomId;
        const isLive = !!roomId && roomId !== '0';

        return { isLive, avatarUrl };
    } catch {
        return { isLive: false, avatarUrl: null };
    }
}
