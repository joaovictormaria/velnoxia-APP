import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminSession } from "../auth/session";
import { createPost, deletePost, listPosts, updatePost } from "../repositories/post-repository";
import {
  getStoreSettings,
  updateAboutSection,
} from "../repositories/store-settings-repository";

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

const postSchema = z.object({
  title: z.string().trim().min(1, "Informe o título."),
  body: z.string().trim().min(1, "Escreva o texto da publicação."),
  imageUrl: optionalText,
  isPublished: z.boolean(),
  publishedAt: z.string().trim().nullish(),
});

export const listPostsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  return listPosts(storeId);
});

export const savePostFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().nullish(), data: postSchema }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    // A date the browser sends as "2026-08-18" is midnight UTC; parsing it here
    // keeps the stored instant the same one the owner picked.
    const publishedAt = data.data.publishedAt ? new Date(data.data.publishedAt) : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) {
      return { ok: false as const, error: "Data de publicação inválida." };
    }
    const input = { ...data.data, publishedAt };
    const post = data.id
      ? await updatePost(storeId, data.id, input)
      : await createPost(storeId, input);
    return { ok: true as const, post };
  });

export const deletePostFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await deletePost(storeId, data.id);
    return { ok: true as const };
  });

export const getAboutFn = createServerFn({ method: "GET" }).handler(async () => {
  const { storeId } = await requireAdminSession();
  const s = await getStoreSettings(storeId);
  return {
    aboutEyebrow: s.aboutEyebrow,
    aboutTitle: s.aboutTitle,
    aboutBody: s.aboutBody,
    aboutImageUrl: s.aboutImageUrl,
  };
});

export const saveAboutFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      aboutEyebrow: optionalText,
      aboutTitle: optionalText,
      aboutBody: optionalText,
      aboutImageUrl: optionalText,
    }),
  )
  .handler(async ({ data }) => {
    const { storeId } = await requireAdminSession();
    await updateAboutSection(storeId, data);
    return { ok: true as const };
  });
