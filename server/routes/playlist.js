import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { isApacheCompatible } from '../utils/functions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const dataDir = path.join(__dirname, '../data');

const ORIGIN_API = 'https://tp.drmlive-01.workers.dev/origin';
const STB_ONLY_API = 'https://tp.drmlive-01.workers.dev/stb_only';

// Generate playlist
router.get('/generate', async (req, res) => {
  try {
    const loginFile = path.join(dataDir, 'login.json');
    
    if (!await fs.pathExists(loginFile)) {
      return res.status(401).send('Login required');
    }

    const userAgent = req.get('User-Agent') || '';
    
    // Fetch channels data
    const channelsResponse = await axios.get(ORIGIN_API);
    const channels = channelsResponse.data?.data?.list || [];
    
    if (!Array.isArray(channels)) {
      return res.status(500).send('# Error: Invalid or missing \'list\' in response\n');
    }

    // Fetch skip IDs
    let skipIds = [];
    try {
      const skipResponse = await axios.get(STB_ONLY_API);
      skipIds = Array.isArray(skipResponse.data) ? skipResponse.data : [];
    } catch (error) {
      console.error('Failed to fetch skip IDs:', error);
    }

    // Determine headers based on user agent
    let liveHeaders;
    if (userAgent.toLowerCase().includes('tivimate')) {
      liveHeaders = '| X-Forwarded-For=59.178.74.184 | Origin=https://watch.tataplay.com | Referer=https://watch.tataplay.com/';
    } else if (userAgent.toLowerCase().includes('sparkletv')) {
      liveHeaders = '|X-Forwarded-For=59.178.74.184|Origin=https://watch.tataplay.com|Referer=https://watch.tataplay.com/';
    } else {
      liveHeaders = '|X-Forwarded-For=59.178.74.184&Origin=https://watch.tataplay.com&Referer=https://watch.tataplay.com/';
    }

    // Build base URL
    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}/api/content`;

    let playlist = '#EXTM3U\n\n';

    for (const channel of channels) {
      const channelId = channel.id;
      
      // Skip channels in skip list or DistroTV
      if (skipIds.includes(channelId) || channel.provider === 'DistroTV') {
        continue;
      }

      const channelName = channel.title;
      const channelLogo = channel.transparentImageUrl;
      let channelGenre = channel.genres?.[0] || 'General';
      
      if (channel.genres?.includes('HD')) {
        channelGenre += ', HD';
      }

      const licenseUrl = `https://tp.drmlive-01.workers.dev?id=${channelId}`;
      const channelLive = `${baseUrl}/manifest/${channelId}${liveHeaders}`;

      playlist += `#EXTINF:-1 tvg-id="ts${channelId}" tvg-logo="${channelLogo}" group-title="${channelGenre}",${channelName}\n`;
      playlist += `#KODIPROP:inputstream.adaptive.license_type=clearkey\n`;
      playlist += `#KODIPROP:inputstream.adaptive.license_key=${licenseUrl}\n`;
      playlist += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
      playlist += `#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36\n`;
      playlist += `${channelLive}\n\n`;
    }

    res.set({
      'Content-Type': 'audio/x-mpegurl',
      'Content-Disposition': 'attachment; filename="playlist.m3u"'
    });

    res.send(playlist);
  } catch (error) {
    console.error('Playlist generation error:', error);
    res.status(500).send('Failed to generate playlist');
  }
});

export default router;