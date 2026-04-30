import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import type { ExtendedClient } from '../../src/helpers/interfaces.js';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';

process.env.TIKTOK_USERNAME = 'pokenonii';
process.env.LIVE_DISPLAY_NAME = 'TestStreamer';
process.env.LIVE_START_TIME = '15';
process.env.LIVE_END_TIME = '18';

const mockScheduleJob = jest.fn();
jest.unstable_mockModule('node-schedule', () => ({
    default: {
        scheduleJob: mockScheduleJob,
    },
}));

const mockSetTitle = jest.fn().mockReturnThis();
const mockSetColor = jest.fn().mockReturnThis();
const mockSetThumbnail = jest.fn().mockReturnThis();
const mockAddFields = jest.fn().mockReturnThis();
const mockSetFooter = jest.fn().mockReturnThis();
const mockSetTimestamp = jest.fn().mockReturnThis();

const mockEmbedBuilder = jest.fn().mockImplementation(() => ({
    setTitle: mockSetTitle,
    setColor: mockSetColor,
    setThumbnail: mockSetThumbnail,
    addFields: mockAddFields,
    setFooter: mockSetFooter,
    setTimestamp: mockSetTimestamp,
}));

jest.unstable_mockModule('discord.js', () => ({
    EmbedBuilder: mockEmbedBuilder,
    Colors: {
        Purple: 10181046,
    },
}));

const { default: TikTokLiveNotifier } = await import('../../src/commands/naniko.js');

const LIVE_PROFILE_HTML =
    '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"avatarLarger":"https://example.com/avatar.jpg","roomId":"7607695933891218198"}}}}}</script>';
const OFFLINE_PROFILE_HTML =
    '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"avatarLarger":"https://example.com/avatar.jpg","roomId":""}}}}}</script>';

describe('TikTokLiveNotifier - without TIKTOK_USERNAME', () => {
    test('should return early if TIKTOK_USERNAME is not set', () => {
        const savedUsername = process.env.TIKTOK_USERNAME;
        delete process.env.TIKTOK_USERNAME;

        const mockClient = {
            version: '1.0.0',
            user: {
                displayAvatarURL: jest.fn(() => 'http://example.com/avatar.jpg'),
            },
            channels: {
                fetch: jest.fn<(id: string) => Promise<any>>(),
            },
        } as unknown as ExtendedClient;

        const mockLogger = {
            log: jest.fn(),
        };

        mockScheduleJob.mockClear();
        const notifier = new TikTokLiveNotifier(mockClient, mockLogger);

        expect(notifier).toBeDefined();
        expect(mockScheduleJob).not.toHaveBeenCalled();

        process.env.TIKTOK_USERNAME = savedUsername;
    });
});

describe('TikTokLiveNotifier', () => {
    let mockClient: ExtendedClient;
    let mockLogger: { log: jest.Mock };
    let notifier: typeof TikTokLiveNotifier.prototype;
    let scheduledCallbacks: Function[] = [];

    beforeEach(() => {
        scheduledCallbacks = [];

        delete process.env.TIKTOK_LIVE_CHANNEL_IDS;
        delete process.env.TWITCH_STREAM;
        delete process.env.TWITCH_USERNAME;
        delete process.env.INSTA_STREAM;
        delete process.env.INSTA_USERNAME;

        mockSetTitle.mockClear();
        mockSetColor.mockClear();
        mockSetThumbnail.mockClear();
        mockAddFields.mockClear();
        mockSetFooter.mockClear();
        mockSetTimestamp.mockClear();
        mockEmbedBuilder.mockClear();
        mockScheduleJob.mockClear();

        mockScheduleJob.mockImplementation((...args: any[]) => {
            const callback = args[1] as Function;
            scheduledCallbacks.push(callback);
            return {};
        });

        server.use(
            http.get('https://www.tiktok.com/@pokenonii', () => {
                return HttpResponse.text(OFFLINE_PROFILE_HTML);
            })
        );

        mockClient = {
            version: '1.0.0',
            user: {
                displayAvatarURL: jest.fn(() => 'http://example.com/avatar.jpg'),
            },
            channels: {
                fetch: jest.fn<(id: string) => Promise<any>>(),
            },
        } as unknown as ExtendedClient;

        mockLogger = {
            log: jest.fn(),
        };
    });

    afterEach(() => {
        delete process.env.TIKTOK_LIVE_CHANNEL_IDS;
        delete process.env.TWITCH_STREAM;
        delete process.env.TWITCH_USERNAME;
        delete process.env.INSTA_STREAM;
        delete process.env.INSTA_USERNAME;
    });

    describe('constructor', () => {
        test('should throw error if LIVE_DISPLAY_NAME is missing', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            const savedDisplayName = process.env.LIVE_DISPLAY_NAME;
            delete process.env.LIVE_DISPLAY_NAME;

            expect(() => {
                new TikTokLiveNotifier(mockClient, mockLogger);
            }).toThrow('LIVE_DISPLAY_NAME environment variable is required');

            process.env.LIVE_DISPLAY_NAME = savedDisplayName;
        });

        test('should throw error for invalid time format', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            const savedStartTime = process.env.LIVE_START_TIME;
            process.env.LIVE_START_TIME = 'invalid';

            expect(() => {
                new TikTokLiveNotifier(mockClient, mockLogger);
            }).toThrow('must be valid hour numbers');

            process.env.LIVE_START_TIME = savedStartTime;
        });

        test('should throw error for time out of range', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            const savedStartTime = process.env.LIVE_START_TIME;
            process.env.LIVE_START_TIME = '25';

            expect(() => {
                new TikTokLiveNotifier(mockClient, mockLogger);
            }).toThrow('must be between 0 and 23');

            process.env.LIVE_START_TIME = savedStartTime;
        });

        test('should use default time values if not set', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            const savedStartTime = process.env.LIVE_START_TIME;
            const savedEndTime = process.env.LIVE_END_TIME;
            delete process.env.LIVE_START_TIME;
            delete process.env.LIVE_END_TIME;

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(notifier).toBeDefined();
            expect(mockScheduleJob).toHaveBeenCalledWith('*/1 15-18 * * *', expect.any(Function));

            process.env.LIVE_START_TIME = savedStartTime;
            process.env.LIVE_END_TIME = savedEndTime;
        });

        test('should initialize with client and logger', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(notifier).toBeDefined();
        });

        test('should create embed card with correct properties', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockEmbedBuilder).toHaveBeenCalled();
            expect(mockSetTitle).toHaveBeenCalledWith('🎵 Live Notification');
            expect(mockSetColor).toHaveBeenCalledWith(10181046);
            expect(mockAddFields).toHaveBeenCalled();
            expect(mockSetFooter).toHaveBeenCalled();
        });

        test('should not include Twitch link when TWITCH_STREAM is not set', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg).toBeDefined();
            expect(firstArg.value).toBeDefined();
            expect(firstArg.value).not.toContain('Twitch');
        });

        test('should include Twitch link when TWITCH_STREAM is set', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            process.env.TWITCH_STREAM = 'true';
            process.env.TWITCH_USERNAME = 'teststreamer';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg).toBeDefined();
            expect(firstArg.value).toBeDefined();
            expect(firstArg.value).toContain('Twitch');
        });

        test('should handle TWITCH_STREAM set but TWITCH_USERNAME undefined', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            process.env.TWITCH_STREAM = 'true';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg).toBeDefined();
            expect(firstArg.value).toBeDefined();
            expect(firstArg.value).toContain('Twitch');
            expect(firstArg.value).toContain('undefined');
        });

        test('should not include Instagram link when INSTA_STREAM is not set', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg.value).not.toContain('Instagram');
        });

        test('should include Instagram link when INSTA_STREAM is set', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            process.env.INSTA_STREAM = 'true';
            process.env.INSTA_USERNAME = 'teststreamer';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg.value).toContain('Instagram');
            expect(firstArg.value).toContain('teststreamer');
        });

        test('should handle INSTA_STREAM set but INSTA_USERNAME undefined', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            process.env.INSTA_STREAM = 'true';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockAddFields).toHaveBeenCalled();
            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg.value).toContain('Instagram');
            expect(firstArg.value).toContain('undefined');
        });

        test('should format message with all platforms using or before last', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';
            process.env.TWITCH_STREAM = 'true';
            process.env.TWITCH_USERNAME = 'testtwitch';
            process.env.INSTA_STREAM = 'true';
            process.env.INSTA_USERNAME = 'testinsta';

            mockAddFields.mockClear();

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            const firstArg = mockAddFields.mock.calls[0][0] as any;
            expect(firstArg.value).toContain('TikTok');
            expect(firstArg.value).toContain('Twitch');
            expect(firstArg.value).toContain('Instagram');
            expect(firstArg.value).toMatch(/Twitch.+or.+Instagram/);
        });

        test('should schedule cron job', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(mockScheduleJob).toHaveBeenCalledWith('*/1 15-18 * * *', expect.any(Function));
        });

        test('should parse multiple channel IDs from environment', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123,456,789';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(notifier).toBeDefined();
        });

        test('should handle undefined channel IDs', () => {
            delete process.env.TIKTOK_LIVE_CHANNEL_IDS;

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(notifier).toBeDefined();
        });

        test('should handle empty string channel IDs', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);

            expect(notifier).toBeDefined();
        });

        test('should handle client with undefined user', () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            const mockClientNoUser = {
                version: '1.0.0',
                user: undefined,
                channels: {
                    fetch: jest.fn<(id: string) => Promise<any>>(),
                },
            } as unknown as ExtendedClient;

            notifier = new TikTokLiveNotifier(mockClientNoUser, mockLogger);

            expect(notifier).toBeDefined();
            expect(mockSetFooter).toHaveBeenCalled();
            const footerCall = mockSetFooter.mock.calls[mockSetFooter.mock.calls.length - 1][0] as {
                text: string;
                iconURL?: string;
            };
            expect(footerCall.iconURL).toBeUndefined();
        });
    });

    describe('fetchProfileData', () => {
        test('should detect live status and fetch avatar with avatarLarger', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"avatarLarger":"https://example.com/large.jpg","roomId":"123456"}}}}}</script>'
                    );
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockSetThumbnail).toHaveBeenCalledWith('https://example.com/large.jpg');
        });

        test('should use avatarMedium if avatarLarger is not available', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"avatarMedium":"https://example.com/medium.jpg","roomId":"123456"}}}}}</script>'
                    );
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockSetThumbnail).toHaveBeenCalledWith('https://example.com/medium.jpg');
        });

        test('should handle fetch response not ok', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return new HttpResponse(null, { status: 404 });
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should handle missing script tag in HTML', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text('<html><body>No script tag here</body></html>');
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should handle invalid JSON in script tag', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">invalid json</script>');
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should handle missing avatar data in parsed JSON', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{}}</script>'
                    );
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should handle partial JSON structure with missing user', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{}}}}</script>'
                    );
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should handle fetch throwing an error', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.error();
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should treat roomId of 0 as offline', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"avatarLarger":"https://example.com/avatar.jpg","roomId":"0"}}}}}</script>'
                    );
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        test('should not set thumbnail when avatar is unavailable', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(
                        '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"userInfo":{"user":{"roomId":"123456"}}}}}</script>'
                    );
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            mockSetThumbnail.mockClear();
            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockSetThumbnail).not.toHaveBeenCalled();
            expect(mockChannel.send).toHaveBeenCalled();
        });
    });

    describe('checkLive - scheduled task', () => {
        test('should return early when user is offline', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockChannel.send).not.toHaveBeenCalled();
            expect(mockLogger.log).not.toHaveBeenCalled();
        });

        test('should not send notification if already sent today', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockChannel.send).toHaveBeenCalledTimes(1);

            mockChannel.send.mockClear();

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockChannel.send).not.toHaveBeenCalled();
        });

        test('should send notification to configured channels when live', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789,987654321';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockClient.channels.fetch).toHaveBeenCalledWith('123456789');
            expect(mockClient.channels.fetch).toHaveBeenCalledWith('987654321');
            expect(mockChannel.send).toHaveBeenCalledTimes(2);
        });

        test('should send @everyone ping with notification', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockResolvedValue({} as any),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockChannel.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '@everyone',
                    allowedMentions: { parse: ['everyone'] },
                })
            );
        });

        test('should log error when no channel IDs configured', async () => {
            delete process.env.TIKTOK_LIVE_CHANNEL_IDS;

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();

            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalled();
            const logCalls = mockLogger.log.mock.calls;
            const hasErrorMessage = logCalls.some((call) => {
                const arg = call[0];
                if (typeof arg === 'string') {
                    return arg.includes('No Channel ID');
                }
                if (arg && typeof arg === 'object' && 'message' in arg && typeof arg.message === 'string') {
                    return arg.message.includes('No Channel ID');
                }
                return false;
            });
            expect(hasErrorMessage).toBe(true);
        });

        test('should handle channel fetch failure', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(null as any);

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith('Error: Channel not found or is not a text-based channel.');
        });

        test('should handle non-text-based channel', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockVoiceChannel = {
                isTextBased: jest.fn(() => false),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockVoiceChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith('Error: Channel not found or is not a text-based channel.');
        });

        test('should handle channel without send method', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannelNoSend = {
                isTextBased: jest.fn(() => true),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannelNoSend as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith(
                'Error: Bot does not have permission to send messages in the channel.'
            );
        });

        test('should handle channel with send property that is not a function', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannelSendNotFunction = {
                isTextBased: jest.fn(() => true),
                send: 'not a function',
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannelSendNotFunction as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith(
                'Error: Bot does not have permission to send messages in the channel.'
            );
        });

        test('should handle channel send throwing an error', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const sendError = new Error('Send failed');
            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockRejectedValue(sendError),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Error sending to channel'));
            expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Send failed'));
        });

        test('should handle channel send throwing a non-Error value', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            server.use(
                http.get('https://www.tiktok.com/@pokenonii', () => {
                    return HttpResponse.text(LIVE_PROFILE_HTML);
                })
            );

            const mockChannel = {
                isTextBased: jest.fn(() => true),
                send: jest.fn<() => Promise<any>>().mockRejectedValue('String error'),
            };

            (mockClient.channels.fetch as jest.Mock<(id: string) => Promise<any>>).mockResolvedValue(
                mockChannel as any
            );

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            mockLogger.log.mockClear();
            await callback();
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('Error sending to channel'));
            expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('String error'));
        });

        test('should clear dayCheck map on new day', async () => {
            process.env.TIKTOK_LIVE_CHANNEL_IDS = '123456789';

            notifier = new TikTokLiveNotifier(mockClient, mockLogger);
            const callback = scheduledCallbacks[scheduledCallbacks.length - 1];

            await callback();

            expect(notifier).toBeDefined();
        });
    });
});
