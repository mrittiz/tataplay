import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { generateNumericUuid } from '../utils/functions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const dataDir = path.join(__dirname, '../data');

// Check if user is logged in
router.get('/check-login', async (req, res) => {
  try {
    const loginFile = path.join(dataDir, 'login.json');
    const exists = await fs.pathExists(loginFile);
    res.json({ exists });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check login status' });
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { mobile } = req.body;
    
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }

    const credFile = path.join(dataDir, 'guest-device.cred');
    
    let deviceId, anonymousId;
    
    if (await fs.pathExists(credFile)) {
      const cred = await fs.readJson(credFile);
      deviceId = cred.deviceId;
      anonymousId = cred.anonymousId;
    } else {
      deviceId = generateNumericUuid();
      
      const guestResponse = await axios.post(
        'https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/guest/register',
        {},
        {
          headers: {
            'accept': 'application/json, text/plain, */*',
            'authorization': 'bearer undefined',
            'content-length': '0',
            'referer': 'https://www.tataplaybinge.com/',
            'deviceid': deviceId,
            'origin': 'https://www.tataplaybinge.com',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
          }
        }
      );
      
      anonymousId = guestResponse.data?.data?.anonymousId;
      
      if (!anonymousId) {
        return res.status(500).json({ error: 'Failed to register device' });
      }
      
      await fs.writeJson(credFile, { deviceId, anonymousId });
    }

    const otpResponse = await axios.post(
      'https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/generateOTP',
      {},
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'anonymousid': anonymousId,
          'content-length': '0',
          'deviceid': deviceId,
          'mobilenumber': mobile,
          'newotpflow': '4DOTP',
          'origin': 'https://www.tataplaybinge.com',
          'platform': 'BINGE_ANYWHERE',
          'referer': 'https://www.tataplaybinge.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
      }
    );

    res.json({ message: otpResponse.data?.message || 'OTP sent successfully' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile) || !otp || !/^\d{4,6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const credFile = path.join(dataDir, 'guest-device.cred');
    
    if (!await fs.pathExists(credFile)) {
      return res.status(500).json({ error: 'Missing device credentials' });
    }

    const cred = await fs.readJson(credFile);
    const { deviceId, anonymousId } = cred;

    // Validate OTP
    const validateResponse = await axios.post(
      'https://tb.tapi.videoready.tv/binge-mobile-services/pub/api/v1/user/authentication/validateOTP',
      { mobileNumber: mobile, otp },
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'anonymousid': anonymousId,
          'content-type': 'application/json',
          'deviceid': deviceId,
          'origin': 'https://www.tataplaybinge.com',
          'platform': 'BINGE_ANYWHERE',
          'referer': 'https://www.tataplaybinge.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
      }
    );

    const token = validateResponse.data?.data?.userAuthenticateToken;
    const deviceToken = validateResponse.data?.data?.deviceAuthenticateToken;

    if (!token) {
      return res.status(400).json({ error: validateResponse.data?.message || 'OTP validation failed' });
    }

    // Get subscriber details
    const subResponse = await axios.get(
      'https://tb.tapi.videoready.tv/binge-mobile-services/api/v4/subscriber/details',
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'anonymousid': anonymousId,
          'authorization': `bearer ${token}`,
          'devicetype': 'WEB',
          'mobilenumber': mobile,
          'origin': 'https://www.tataplaybinge.com',
          'platform': 'BINGE_ANYWHERE',
          'referer': 'https://www.tataplaybinge.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        }
      }
    );

    const accountDetails = subResponse.data?.data?.accountDetails?.[0] || {};
    const dthStatus = accountDetails.dthStatus || '';

    // Login based on DTH status
    let loginUrl, loginBody;

    if (!dthStatus) {
      loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user';
      loginBody = {
        dthStatus: 'Non DTH User',
        subscriberId: mobile,
        login: 'OTP',
        mobileNumber: mobile,
        isPastBingeUser: false,
        eulaChecked: true,
        packageId: ''
      };
    } else if (dthStatus === 'DTH Without Binge') {
      loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/create/new/user';
      loginBody = {
        dthStatus: 'DTH Without Binge',
        subscriberId: accountDetails.subscriberId || '',
        login: 'OTP',
        mobileNumber: mobile,
        baId: null,
        isPastBingeUser: false,
        eulaChecked: true,
        packageId: '',
        referenceId: null
      };
    } else {
      loginUrl = 'https://tb.tapi.videoready.tv/binge-mobile-services/api/v3/update/exist/user';
      loginBody = {
        dthStatus,
        subscriberId: accountDetails.subscriberId || '',
        bingeSubscriberId: accountDetails.bingeSubscriberId || '',
        baId: accountDetails.baId || '',
        login: 'OTP',
        mobileNumber: mobile,
        payment_return_url: 'https://www.tataplaybinge.com/subscription-transaction/status',
        eulaChecked: true,
        packageId: ''
      };
    }

    const loginResponse = await axios.post(loginUrl, loginBody, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'anonymousid': anonymousId,
        'authorization': `bearer ${token}`,
        'content-type': 'application/json',
        'device': 'WEB',
        'deviceid': deviceId,
        'devicename': 'Web',
        'devicetoken': deviceToken,
        'origin': 'https://www.tataplaybinge.com',
        'platform': 'WEB',
        'referer': 'https://www.tataplaybinge.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      }
    });

    // Save login data
    const loginFile = path.join(dataDir, 'login.json');
    await fs.writeJson(loginFile, loginResponse.data);

    res.json({ message: loginResponse.data?.message || 'Login successful' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const loginFile = path.join(dataDir, 'login.json');
    const guestCredsFile = path.join(dataDir, 'guest-device.cred');
    const cacheUrlsFile = path.join(dataDir, 'cache_urls.json');

    if (!await fs.pathExists(loginFile)) {
      return res.json({ message: 'Already logged out' });
    }

    const loginData = await fs.readJson(loginFile);
    const guestCreds = await fs.readJson(guestCredsFile).catch(() => null);

    if (!loginData?.data || !guestCreds) {
      return res.json({ message: 'Already logged out' });
    }

    const loginInfo = loginData.data;
    const logoutUrl = `https://tb.tapi.videoready.tv/binge-mobile-services/api/v2/logout/${loginInfo.baId}`;

    try {
      const logoutResponse = await axios.post(logoutUrl, {}, {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'authorization': loginInfo.userAuthenticateToken,
          'deviceid': guestCreds.deviceId,
          'devicetoken': loginInfo.deviceAuthenticateToken,
          'dthstatus': loginInfo.dthStatus,
          'subscriberid': loginInfo.subscriberId,
          'subscriptiontype': loginInfo.subscriptionStatus,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
        }
      });

      if (logoutResponse.data?.message === 'You have been successfully logged out.') {
        // Clean up files
        await Promise.all([
          fs.remove(loginFile).catch(() => {}),
          fs.remove(guestCredsFile).catch(() => {}),
          fs.remove(cacheUrlsFile).catch(() => {})
        ]);
      }

      res.json({ message: logoutResponse.data?.message || 'Logged out successfully' });
    } catch (error) {
      res.json({ message: 'Already logged out' });
    }
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;