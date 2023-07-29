import ReconnectingWebSocket from 'reconnecting-websocket';

import { engineEventToFrame, type Frame } from './types';

type FrameCallback = (frame: Frame) => void;

// Engine data
let ws: WebSocket;
let loadedFrames = new Set();


export function fetchGame(fetchFunc: typeof fetch, gameID: string, engineHost: string, frames: Frame[], onFrameLoad: FrameCallback, onError: (message: string) => void) {
    console.debug(`[playback] loading game ${gameID}`);

    // Reset
    if (ws) ws.close();
    loadedFrames = new Set();

    const gameInfoUrl = `https://${engineHost}/games/${gameID}`;
    const gameEventsUrl = `wss://${engineHost}/games/${gameID}/events`;

    fetchFunc(gameInfoUrl)
        .then(async (response) => {
            if (response.status == 404) {
                throw new Error('Game not found');
            } else if (!response.ok) {
                throw new Error('Error loading game');
            }

            const gameInfo = await response.json()
            const ws = new ReconnectingWebSocket(gameEventsUrl);

            ws.onopen = () => {
                console.debug('[playback] opening engine websocket');
            };

            ws.onmessage = (message) => {
                const engineEvent = JSON.parse(message.data);

                if (engineEvent.Type == 'frame' && !(loadedFrames.has(engineEvent.Data.Turn))) {
                    loadedFrames.add(engineEvent.Data.Turn);

                    const frame = engineEventToFrame(gameInfo, engineEvent.Data)
                    frames.push(frame);
                    frames.sort((a: Frame, b: Frame) => a.turn - b.turn);

                    // Fire frame callback
                    if (engineEvent.Data.Turn == 0) {
                        console.debug('[playback] received first frame');
                    }
                    onFrameLoad(frame);

                } else if (engineEvent.Type == 'game_end') {
                    console.debug('[playback] received final frame');
                    frames[frames.length - 1].isFinalFrame = true;
                    if (ws) ws.close();
                }
            };

            ws.onclose = () => {
                console.debug('[playback] closing engine websocket');
            };

        }).catch(function (e) {
            console.error(e);
            onError(e.message);
        });
}
