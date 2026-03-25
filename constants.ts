export const LOCAL_STORAGE_KEY = 'echo_app_state_v1';
export const MAX_POSTS_IN_MEMORY = 50;

// Reverted to default gender-neutral avatars
export const DEFAULT_AVATAR_URL = (seed: string) => 
  `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;