import crypto from 'crypto';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const AES_KEY = 'aesEncryptionKey';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

export function generateNumericUuid() {
  return String(Math.floor(Math.random() * 900) + 100) + 
         String(Date.now()) + 
         String(Math.floor(Math.random() * 90) + 10);
}

export function decryptUrl(encryptedUrl, aesKey = AES_KEY) {
  try {
    const cleanEncrypted = encryptedUrl.replace(/#.*$/, '');
    const decoded = Buffer.from(cleanEncrypted, 'base64');
    
    const decipher = crypto.createDecipher('aes-128-ecb', aesKey);
    let decrypted = decipher.update(decoded);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    return false;
  }
}

export async function extractPsshFromManifest(content, baseUrl, userAgent = USER_AGENT) {
  try {
    const result = await parseStringPromise(content);
    const periods = result?.MPD?.Period || [];
    
    for (const period of periods) {
      const adaptationSets = period.AdaptationSet || [];
      
      for (const set of adaptationSets) {
        if (set.$?.contentType === 'audio') {
          const representations = set.Representation || [];
          
          for (const rep of representations) {
            const template = rep.SegmentTemplate?.[0];
            if (template) {
              const media = template.$?.media
                ?.replace('$RepresentationID$', rep.$?.id || '')
                ?.replace('$Number$', String((parseInt(template.$?.startNumber || '0') + parseInt(template.SegmentTimeline?.[0]?.S?.[0]?.$?.r || '0'))));
              
              if (media) {
                const url = `${baseUrl}/dash/${media}`;
                
                try {
                  const response = await axios.get(url, {
                    headers: {
                      'User-Agent': userAgent,
                      'Referer': 'https://watch.tataplay.com/',
                      'Origin': 'https://watch.tataplay.com'
                    },
                    responseType: 'arraybuffer'
                  });
                  
                  const hexContent = Buffer.from(response.data).toString('hex');
                  return extractKidAndPssh(hexContent);
                } catch (error) {
                  console.error('Error fetching segment:', error);
                }
              }
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing manifest:', error);
    return null;
  }
}

export function extractKidAndPssh(hexContent) {
  try {
    const psshMarker = "70737368";
    const psshOffsets = [];
    let offset = 0;
    
    while ((offset = hexContent.indexOf(psshMarker, offset)) !== -1) {
      psshOffsets.push(offset);
      offset += 8;
    }
    
    if (psshOffsets.length < 2) {
      console.error("Error: Less than two PSSH found.");
      return null;
    }
    
    // Widevine PSSH
    const wvPsshOffset = psshOffsets[0];
    const wvHeaderSizeHex = hexContent.substr(wvPsshOffset - 8, 8);
    const wvHeaderSize = parseInt(wvHeaderSizeHex, 16);
    const wvPsshHex = hexContent.substr(wvPsshOffset - 8, wvHeaderSize * 2);
    const wvKidHex = wvPsshHex.substr(68, 32);
    
    const newWvPsshHex = "000000327073736800000000edef8ba979d64acea3c827dcd51d21ed000000121210" + wvKidHex;
    const wvPsshBase64 = Buffer.from(newWvPsshHex, 'hex').toString('base64');
    
    const wvKid = wvKidHex.substr(0, 8) + "-" + 
                  wvKidHex.substr(8, 4) + "-" + 
                  wvKidHex.substr(12, 4) + "-" + 
                  wvKidHex.substr(16, 4) + "-" + 
                  wvKidHex.substr(20);
    
    // PlayReady PSSH
    const prPsshOffset = psshOffsets[1];
    const prHeaderSizeHex = hexContent.substr(prPsshOffset - 8, 8);
    const prHeaderSize = parseInt(prHeaderSizeHex, 16);
    const prPsshHex = hexContent.substr(prPsshOffset - 8, prHeaderSize * 2);
    const prPsshBase64 = Buffer.from(prPsshHex, 'hex').toString('base64');
    
    return {
      pssh: wvPsshBase64,
      kid: wvKid,
      pr_pssh: prPsshBase64
    };
  } catch (error) {
    console.error('Error extracting PSSH:', error);
    return null;
  }
}

export function isApacheCompatible(serverSoftware) {
  return serverSoftware && (
    serverSoftware.toLowerCase().includes('apache') || 
    serverSoftware.toLowerCase().includes('litespeed')
  );
}