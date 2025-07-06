import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { decryptUrl, extractPsshFromManifest } from '../utils/functions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const dataDir = path.join(__dirname, '../data');

const AES_KEY = 'aesEncryptionKey';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// Get MPD manifest
router.get('/manifest/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).send('Missing content ID');
    }

    const loginFile = path.join(dataDir, 'login.json');
    
    if (!await fs.pathExists(loginFile)) {
      return res.status(401).send('Login required');
    }

    const loginData = await fs.readJson(loginFile);
    
    if (!loginData?.data?.subscriberId || !loginData?.data?.userAuthenticateToken) {
      return res.status(403).send('Invalid login data');
    }

    const { subscriberId, userAuthenticateToken } = loginData.data;
    const cacheFile = path.join(dataDir, 'cache_urls.json');
    
    let cacheData = {};
    if (await fs.pathExists(cacheFile)) {
      cacheData = await fs.readJson(cacheFile);
    }

    let mpdUrl;
    let useCache = false;

    // Check cache
    if (cacheData[id]) {
      const cachedUrl = cacheData[id].url;
      const urlObj = new URL(cachedUrl);
      const queryParams = Object.fromEntries(urlObj.searchParams);
      
      let exp = queryParams.exp;
      if (queryParams.hdntl) {
        const hdntlParams = Object.fromEntries(
          queryParams.hdntl.split('~').map(param => param.split('='))
        );
        exp = hdntlParams.exp;
      }

      if (exp && !isNaN(exp) && Date.now() / 1000 < parseInt(exp)) {
        mpdUrl = cachedUrl;
        useCache = true;
      }
    }

    if (!useCache) {
      // Fetch content data
      const contentApi = `https://tb.tapi.videoready.tv/content-detail/api/partner/cdn/player/details/chotiluli/${id}`;
      
      const contentResponse = await axios.get(contentApi, {
        headers: {
          'Authorization': `Bearer ${userAuthenticateToken}`,
          'subscriberId': subscriberId
        }
      });

      const dashPlayreadyPlayUrl = contentResponse.data?.data?.dashPlayreadyPlayUrl;
      
      if (!dashPlayreadyPlayUrl) {
        return res.status(404).send('dashPlayreadyPlayUrl not found');
      }

      let decryptedUrl = decryptUrl(dashPlayreadyPlayUrl, AES_KEY);
      decryptedUrl = decryptedUrl.replace('bpaicatchupta', 'bpaita');

      if (!decryptedUrl.includes('bpaita')) {
        return res.redirect(decryptedUrl);
      }

      // Get redirect location
      try {
        const headResponse = await axios.head(decryptedUrl, {
          headers: { 'User-Agent': USER_AGENT },
          maxRedirects: 0,
          validateStatus: status => status === 302 || status === 301
        });

        const location = headResponse.headers.location;
        mpdUrl = location.includes('&') ? location.substring(0, location.indexOf('&')) : location;
        
        // Cache the URL
        cacheData[id] = {
          url: mpdUrl,
          updated_at: Math.floor(Date.now() / 1000)
        };
        
        await fs.writeJson(cacheFile, cacheData);
      } catch (error) {
        return res.redirect(decryptedUrl);
      }
    }

    // Fetch MPD content
    const mpdResponse = await axios.get(mpdUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://watch.tataplay.com/',
        'Origin': 'https://watch.tataplay.com'
      }
    });

    let processedManifest = mpdResponse.data;
    const baseUrl = mpdUrl.substring(0, mpdUrl.lastIndexOf('/'));

    // Extract PSSH
    const psshData = await extractPsshFromManifest(processedManifest, baseUrl, USER_AGENT);

    // Process manifest
    processedManifest = processedManifest.replace(/dash\//g, `${baseUrl}/dash/`);

    if (psshData) {
      processedManifest = processedManifest.replace(
        'mp4protection:2011',
        `mp4protection:2011" cenc:default_KID="${psshData.kid}`
      );
      
      processedManifest = processedManifest.replace(
        '" value="PlayReady"/>',
        `"><cenc:pssh>${psshData.pr_pssh}</cenc:pssh></ContentProtection>`
      );
      
      processedManifest = processedManifest.replace(
        '" value="Widevine"/>',
        `"><cenc:pssh>${psshData.pssh}</cenc:pssh></ContentProtection>`
      );
    }

    // Set headers
    res.set({
      'Content-Security-Policy': "default-src 'self';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/dash+xml',
      'Content-Disposition': `attachment; filename="tp${encodeURIComponent(id)}.mpd"`
    });

    res.send(processedManifest);
  } catch (error) {
    console.error('Manifest error:', error);
    res.status(500).send('Failed to fetch MPD content');
  }
});

export default router;