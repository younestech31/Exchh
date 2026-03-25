import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Post, Comment } from '../types';

// Hardcoded configuration
const SUPABASE_URL = 'https://wyasfdpeyzdiqtppooxb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5YXNmZHBleXpkaXF0cHBvb3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwOTU1NjUsImV4cCI6MjA4MDY3MTU2NX0.i6QXXas9XSwyH9-LjJSn392gOygSIwW3nFapmAjx5qI';

export const MAX_POSTS_LIMIT = 100;

export type DeleteResult<T = any> = {
  success: boolean;
  error?: { message: string; status?: number };
  deleted?: T | null;
  reason?: 'not_found' | 'not_owner' | 'permission' | 'network';
};

// Internal UUID Helper
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const validateUUID = (uuid: string): boolean => {
  if (!uuid || typeof uuid !== 'string') return false;
  return uuid.length > 30; 
};

// Helper to format errors consistently
const formatError = (error: any): string => {
  if (!error) return 'Unknown error occurred';
  if (error.message) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
};

// --- 1. SHADOW IDENTITY (FALLBACK) ---
const getShadowIdentity = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('shadow_user_id');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('shadow_user_id', id);
  }
  return id;
};

export const SHADOW_USER_ID = getShadowIdentity();

// --- 2. INITIALIZE CLIENT ---
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: {
    headers: {
      'x-shadow-user-id': SHADOW_USER_ID 
    }
  }
});

export const getSupabase = () => supabase;

// --- 3. AUTHENTICATION ---
let isUsingShadowMode = false;

// Expose status for UI checks
export const isGuest = () => isUsingShadowMode;

export const initializeAuth = async (): Promise<string> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      console.log("[Echo] Restored valid session:", session.user.id);
      isUsingShadowMode = false;
      return session.user.id;
    }

    console.log("[Echo] Attempting Anonymous Sign-in...");
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      if (
        error.message.includes("Anonymous sign-ins are disabled") || 
        error.status === 400 || 
        error.code === 'anonymous_provider_disabled'
      ) {
        console.warn("[Echo] Anonymous Auth disabled. Switching to Shadow Mode.");
        isUsingShadowMode = true;
        return SHADOW_USER_ID;
      }
      throw error;
    }

    if (data.user) {
        isUsingShadowMode = false;
        return data.user.id;
    }
    
    // Fallback if no user returned
    isUsingShadowMode = true;
    return SHADOW_USER_ID;

  } catch (e: any) {
    console.error("[Echo] Auth initialization error (using Shadow Mode):", formatError(e));
    isUsingShadowMode = true;
    return SHADOW_USER_ID;
  }
};

export const getEffectiveUserId = async (): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
      return session.user.id;
  }
  return SHADOW_USER_ID;
};

// --- DATA MAPPING ---

const mapRowToComment = (row: any): Comment => ({
  id: row.id,
  author: {
    nickname: row.nickname || 'Anonymous', 
    avatarSeed: row.avatar_seed || row.nickname || 'default',
    isAi: false, 
    userId: row.user_id
  },
  content: row.content || row.body || '',
  timestamp: new Date(row.created_at).getTime(),
  likes: 0 
});

const mapRowToPost = (row: any): Post => ({
  id: row.id,
  author: {
    nickname: row.nickname,
    avatarSeed: row.avatar_seed,
    isAi: false,
    userId: row.user_id 
  },
  content: row.content,
  tags: row.tags || [],
  timestamp: new Date(row.created_at).getTime(),
  likes: row.likes,
  comments: (row.comments || []).map(mapRowToComment).sort((a: Comment, b: Comment) => a.timestamp - b.timestamp)
});

// --- API METHODS ---

export const fetchPosts = async (): Promise<Post[]> => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        comments (
          id,
          content,
          body,
          nickname,
          avatar_seed,
          user_id,
          created_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(MAX_POSTS_LIMIT);

    if (error) throw error;
    return (data || []).map(mapRowToPost);
  } catch (error) {
    console.error("[Echo] Fetch Posts Failed:", formatError(error));
    throw new Error(formatError(error));
  }
};

export const createPost = async (nickname: string, content: string, tags: string[], userId: string): Promise<Post | null> => {
  if (!content || content.trim().length === 0) throw new Error("Content cannot be empty");
  // Hard limit: 800 characters
  if (content.length > 800) throw new Error("Content exceeds 800 characters");
  if (!userId) throw new Error("Fatal: User ID is missing for post creation.");

  try {
    const { data, error } = await supabase
      .from('posts')
      .insert([{
        nickname,
        content,
        tags,
        avatar_seed: nickname,
        likes: 0,
        user_id: userId
      }])
      .select()
      .single();

    if (error) throw error;

    cleanUpOldPosts(supabase);
    return mapRowToPost({ ...data, comments: [] });
  } catch (error) {
    console.error("[Echo] Create Post Failed:", formatError(error));
    throw new Error(formatError(error));
  }
};

/**
 * deletePost - Robust deletion with strict RLS and ownership verification
 */
export async function deletePost(
  supabase: SupabaseClient,
  postId: string,
  currentUserId: string | null
): Promise<DeleteResult> {
  try {
    if (!postId) return { success: false, error: { message: 'No Post ID provided' } };

    // 1) Pre-check: Verify existence and get owner ID
    const { data: existingPost, error: fetchErr } = await supabase
      .from('posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle();

    if (fetchErr) {
      return { success: false, error: { message: fetchErr.message }, reason: 'network' };
    }

    if (!existingPost) {
      // It's already gone from DB
      return { success: false, error: { message: 'Post already deleted' }, reason: 'not_found' };
    }

    // 2) Client-side Ownership Check
    // If we have a logged-in user (or shadow user), ensure they match the post owner.
    if (currentUserId && existingPost.user_id !== currentUserId) {
      console.warn(`[Echo] Blocked unauthorized delete. Owner: ${existingPost.user_id}, Requester: ${currentUserId}`);
      return { 
        success: false, 
        error: { message: 'You are not the owner of this post.' }, 
        reason: 'not_owner' 
      };
    }

    // 3) Perform Delete
    // Using select() ensures we get the deleted row back.
    // If RLS blocks the delete, 'data' will be null.
    const { data: deletedData, error: deleteErr } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .select()
      .maybeSingle();

    if (deleteErr) {
      return { success: false, error: { message: deleteErr.message }, reason: 'permission' };
    }

    // CRITICAL FIX: If 'data' is null but no error, it means RLS silently blocked the delete.
    if (!deletedData) {
      return { 
        success: false, 
        error: { message: 'Permission denied. Unable to delete post.' }, 
        reason: 'permission' 
      };
    }

    return { success: true, deleted: deletedData };

  } catch (err: any) {
    console.error("[Echo] Delete exception:", err);
    return {
      success: false,
      error: { message: err?.message ?? 'Unexpected error' },
      reason: 'network',
    };
  }
}

// --- COMMENTS ---

export const createComment = async (postId: string, content: string, nickname: string, userId: string): Promise<Comment> => {
  if (!validateUUID(postId)) console.warn("Potential Invalid UUID for comment parent", postId);
  
  if (!content || content.trim().length === 0) throw new Error("Comment cannot be empty");
  // Safety check bumped to 5000 chars for comments too
  if (content.length > 5000) throw new Error("Comment exceeds 5000 characters");
  if (!userId) throw new Error("Fatal: User ID is missing for comment creation.");

  try {
    const { data, error } = await supabase
      .from('comments')
      .insert([{
        post_id: postId,
        content: content,
        body: content,
        nickname,
        avatar_seed: nickname,
        user_id: userId
      }])
      .select()
      .single();

    if (error) throw error;

    return mapRowToComment(data);
  } catch (error) {
    console.error("[Echo] Create Comment Failed:", formatError(error));
    throw new Error(formatError(error));
  }
};

export const deleteComment = async (commentId: string): Promise<void> => {
  if (!commentId) throw new Error("Invalid Comment ID");

  // 1. Resolve Identity
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
      if (isUsingShadowMode) {
          throw new Error("Guest users cannot delete comments. Please sign in.");
      }
      throw new Error("Authentication required to delete comments.");
  }

  const currentUserId = session.user.id;

  // 2. Pre-Check Ownership
  const { data: commentCheck } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', commentId)
    .single();

  if (!commentCheck) {
      throw new Error("Comment not found or you don't have permission to delete it.");
  }

  if (commentCheck.user_id !== currentUserId) {
      throw new Error("Permission denied: You are not the owner of this comment.");
  }

  // 3. Perform Delete
  const executeDelete = async () => {
      return await supabase
        .from('comments')
        .delete({ count: 'exact' })
        .eq('id', commentId);
  };

  let { error, count } = await executeDelete();

  // 4. Retry Logic
  if (error) {
      const isTokenError = error.status === 401 || 
                           (error.message && error.message.includes("JWT"));
      if (isTokenError) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
              const retry = await executeDelete();
              error = retry.error;
              count = retry.count;
          }
      }
  }

  // 5. Interpret Results
  if (error) {
      if (error.status === 403 || error.code === '42501') {
          throw new Error("Permission denied. You can only delete your own comments.");
      }
      throw new Error(formatError(error));
  }

  if (count === 0) {
      throw new Error("You don't have permission to delete this comment.");
  }
};

const cleanUpOldPosts = async (client: SupabaseClient) => {
  try {
    const { count } = await client.from('posts').select('*', { count: 'exact', head: true });
    
    if (count !== null && count > MAX_POSTS_LIMIT) {
      const excess = count - MAX_POSTS_LIMIT;
      const { data: oldPosts } = await client
        .from('posts')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(excess + 5); 

      if (oldPosts && oldPosts.length > 0) {
        const ids = oldPosts.map(p => p.id);
        await client.from('posts').delete().in('id', ids);
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
};

export const toggleLike = async (postId: string, increment: boolean) => {
  if (!postId) return;
  try {
    const { data } = await supabase.from('posts').select('likes').eq('id', postId).single();
    if (data) {
      const newLikes = Math.max(0, data.likes + (increment ? 1 : -1));
      await supabase.from('posts').update({ likes: newLikes }).eq('id', postId);
    }
  } catch (e) {
    console.error("[Echo] Like failed:", formatError(e));
  }
};

export const subscribeToPosts = (callback: (payload: any) => void) => {
  return supabase
    .channel('public:posts_and_comments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, callback)
    .subscribe();
};