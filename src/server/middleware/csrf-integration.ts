/**
 * CSRF Integration para H3/Nitro
 *
 * Este arquivo integra o middleware CSRF no H3 automaticamente.
 * É carregado pelo Nitro em cada requisição.
 */

import { defineEventHandler } from "h3";
import { csrfProtectionWithExemptions } from "./csrf-protection";

/**
 * Middleware global CSRF
 * Registrado automaticamente pelo H3
 */
export default defineEventHandler(async (event) => {
  // Aplicar CSRF protection
  await csrfProtectionWithExemptions(event);
});
