import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64) as Buffer).toString("hex");
  return { hash, salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const derivedKey = await scryptAsync(password, salt, 64) as Buffer;
  const stored     = Buffer.from(hash, "hex");
  // timingSafeEqual tira si los buffers difieren en longitud: con un hash corrupto en la
  // base el login rompía con un 500 en vez de fallar la validación.
  if (stored.length !== derivedKey.length) return false;
  return timingSafeEqual(derivedKey, stored);
}
