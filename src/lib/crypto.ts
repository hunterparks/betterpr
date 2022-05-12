import crypto from 'crypto';
import { BetterPrCachePassword } from './types';

const algo = 'aes-256-ctr';
const key = 'NSCcA4wvkQxTKaJp7fFJsQM7mR8WEghn';

export const passwordDecrypt = (cyphertext: BetterPrCachePassword) => {
    const decipher = crypto.createDecipheriv(
        algo,
        key,
        Buffer.from(cyphertext.iv, 'hex')
    );
    const decrpyted = Buffer.concat([
        decipher.update(Buffer.from(cyphertext.content, 'hex')),
        decipher.final(),
    ]);
    return decrpyted.toString();
};

export const passwordEncrypt = (plaintext: string): BetterPrCachePassword => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algo, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex'),
    };
};
