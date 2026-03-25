import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Sun, Moon, Database, XCircle, Terminal, Check, Hash, X, Info, Sparkles, AtSign, Loader2, ArrowDown, Bot } from 'lucide-react';
import { CreatePost } from './components/CreatePost';
import { PostCard } from './components/PostCard';
import { Post } from './types';
import * as SupabaseService from './services/supabaseClient';

type FilterState = 
  | { type: 'tag'; value: string } 
  | { type: 'user'; userId: string; nickname: string } 
  | null;

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  
  const [currentUserNickname, setCurrentUserNickname] = useState<string>(() => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('echo_nickname') || 'Guest';
    }
    return 'Guest';
  });

  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [aiPromptCopied, setAiPromptCopied] = useState(false);
  
  const [activeFilter, setActiveFilter] = useState<FilterState>(null);
  
  const [showDebug, setShowDebug] = useState(false);

  // Pull-to-Refresh State & Refs
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Refs for direct DOM manipulation (Performance optimization)
  const mainContentRef = useRef<HTMLElement>(null);
  const refreshIndicatorRef = useRef<HTMLDivElement>(null);
  const refreshIconRef = useRef<HTMLDivElement>(null);
  
  // Logic Refs
  const touchStartRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentPullYRef = useRef(0);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('echo_theme');
      return saved === 'light' || saved === 'dark' ? saved : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('echo_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('echo_nickname', currentUserNickname);
  }, [currentUserNickname]);

  // Init Auth and Load Data
  useEffect(() => {
    const init = async () => {
        try {
            setIsAuthLoading(true);
            const uid = await SupabaseService.initializeAuth();
            setAuthUserId(uid);
            await loadPosts();
        } catch (e: any) {
            console.error("Critical Init Failure", e);
            setErrorMsg(getErrorMessage(e));
        } finally {
            setIsAuthLoading(false);
            setIsLoading(false);
        }
    };
    init();
  }, []);

  const getErrorMessage = (e: any) => {
    if (!e) return "Unknown error";
    if (e.code && e.message) return `Error ${e.code}: ${e.message}`;
    if (e.message) return e.message;
    if (typeof e === 'object') return JSON.stringify(e);
    return String(e);
  };

  const loadPosts = useCallback(async () => {
    try {
      const remotePosts = await SupabaseService.fetchPosts();
      setPosts(remotePosts);
    } catch (e: any) {
      console.error("Failed to load posts", e);
      if (posts.length === 0) {
        const msg = getErrorMessage(e);
        setErrorMsg(msg);
        if (msg.includes("column") && msg.includes("does not exist")) {
            setShowDebug(true);
        }
      }
    }
  }, [posts.length]);

  // Pull to Refresh Logic (Smooth 60fps Implementation)
  const loadPostsRef = useRef(loadPosts);
  useEffect(() => { loadPostsRef.current = loadPosts; }, [loadPosts]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
        if (window.scrollY <= 0 && !isRefreshing) {
            touchStartRef.current = e.touches[0].clientY;
            isDraggingRef.current = true;
            // Clear transitions for instant dragging response
            if (mainContentRef.current) mainContentRef.current.style.transition = 'none';
            if (refreshIndicatorRef.current) refreshIndicatorRef.current.style.transition = 'none';
            if (refreshIconRef.current) refreshIconRef.current.style.transition = 'none';
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isDraggingRef.current || isRefreshing) return;
        
        const currentY = e.touches[0].clientY;
        const diff = currentY - touchStartRef.current;

        // If dragging up or scrolled down, cancel
        if (diff < 0 || window.scrollY > 0) {
            isDraggingRef.current = false;
            resetDOM();
            return;
        }

        if (diff > 0) {
            if (e.cancelable) e.preventDefault(); // Stop native scroll rubberbanding
            
            // Smoother elastic damping formula
            // limit = max visual pull distance in pixels
            const limit = 160; 
            // damped = limit * (1 - exp(-diff / friction))
            const damped = limit * (1 - Math.exp(-diff / 250));
            
            currentPullYRef.current = damped;

            // Direct DOM Manipulation (No State Updates)
            if (mainContentRef.current) {
                mainContentRef.current.style.transform = `translateY(${damped}px)`;
            }

            if (refreshIndicatorRef.current) {
                // Indicator moves down but slightly slower/clamped
                const indicatorOffset = 74; // header (64) + spacing (10)
                const top = Math.min(damped, 100) + indicatorOffset;
                
                refreshIndicatorRef.current.style.top = `${top}px`;
                refreshIndicatorRef.current.style.opacity = `${Math.min(damped / 40, 1)}`;
                refreshIndicatorRef.current.style.transform = `scale(${Math.min(0.5 + (damped / 100), 1)})`;
            }

            if (refreshIconRef.current) {
                // Rotate based on pull distance
                refreshIconRef.current.style.transform = `rotate(${damped * 2.5}deg)`;
            }
        }
    };

    const handleTouchEnd = async () => {
        if (!isDraggingRef.current || isRefreshing) return;
        isDraggingRef.current = false;
        
        const triggerThreshold = 75; // px

        if (currentPullYRef.current > triggerThreshold) {
            setIsRefreshing(true);
            
            // Animate to "Loading" State
            if (mainContentRef.current) {
                mainContentRef.current.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                mainContentRef.current.style.transform = 'translateY(80px)';
            }
            if (refreshIndicatorRef.current) {
                refreshIndicatorRef.current.style.transition = 'top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                refreshIndicatorRef.current.style.top = `${74 + 70}px`; // Center in the gap
                refreshIndicatorRef.current.style.opacity = '1';
                refreshIndicatorRef.current.style.transform = 'scale(1)';
            }

            // Haptic
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(15);
            }

            try {
                const startTime = Date.now();
                await loadPostsRef.current();
                const elapsed = Date.now() - startTime;
                if (elapsed < 800) {
                    await new Promise(r => setTimeout(r, 800 - elapsed));
                }
            } finally {
                setIsRefreshing(false);
                resetDOM();
            }
        } else {
            // Cancel / Snap Back
            resetDOM();
        }
        currentPullYRef.current = 0;
    };

    const resetDOM = () => {
        if (mainContentRef.current) {
            mainContentRef.current.style.transition = 'transform 0.3s ease-out';
            mainContentRef.current.style.transform = 'translateY(0px)';
        }
        if (refreshIndicatorRef.current) {
            refreshIndicatorRef.current.style.transition = 'top 0.3s ease-out, opacity 0.2s ease-in';
            refreshIndicatorRef.current.style.top = '74px';
            refreshIndicatorRef.current.style.opacity = '0';
            refreshIndicatorRef.current.style.transform = 'scale(0.5)';
        }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isRefreshing]);

  useEffect(() => {
    const subscription = SupabaseService.subscribeToPosts((payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
        loadPosts();
      }
    });
    return () => { subscription?.unsubscribe(); };
  }, [loadPosts]);

  const handleUserPost = async (nickname: string, content: string, tags: string[]) => {
    if (!authUserId) return;
    setCurrentUserNickname(nickname);

    const tempId = Date.now().toString(); 
    const tempPost: Post = {
        id: tempId,
        author: { 
            nickname, 
            avatarSeed: nickname, 
            isAi: false,
            userId: authUserId
        },
        content,
        tags,
        timestamp: Date.now(),
        likes: 0,
        comments: []
    };
    
    setPosts(prev => [tempPost, ...prev]);

    try {
        const realPost = await SupabaseService.createPost(nickname, content, tags, authUserId);
        if (realPost) {
            setPosts(prev => prev.map(p => p.id === tempId ? realPost : p));
        }
    } catch (e: any) {
        console.error("Post failed", e);
        setPosts(prev => prev.filter(p => p.id !== tempId)); 
        alert(`Failed to post.\n\n${getErrorMessage(e)}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const snapshot = [...posts];
    setPosts(prev => prev.filter(p => p.id !== postId));
    
    if (!postId.includes('-') && /^\d+$/.test(postId)) return;

    try {
        const client = SupabaseService.getSupabase();
        const result = await SupabaseService.deletePost(client, postId, authUserId);

        if (!result.success) {
            setPosts(snapshot);
            if (result.reason === 'not_owner') {
                alert(result.error?.message || "You cannot delete this post.");
            } else if (result.reason === 'not_found') {
                alert("Post already deleted or not found.");
                loadPosts();
            } else {
                alert(result.error?.message || "Failed to delete post.");
            }
        }
    } catch (e: any) {
        setPosts(snapshot);
        console.error("Delete exception", e);
        alert(getErrorMessage(e));
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const copySQL = () => {
    const sql = `
-- SQL Script for Echo App (Idempotent)
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  nickname text,
  content text,
  tags text[] default '{}',
  likes int default 0,
  avatar_seed text,
  user_id uuid
);
create table if not exists comments (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid,
  nickname text,
  avatar_seed text,
  content text,
  body text
);

create index if not exists idx_posts_user_id on posts(user_id);
create index if not exists idx_comments_post_id on comments(post_id);

alter table posts enable row level security;
alter table comments enable row level security;

create or replace function set_user_id()
returns trigger as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  elsif new.user_id is null and current_setting('request.headers', true)::json->>'x-shadow-user-id' is not null then
    new.user_id := (current_setting('request.headers', true)::json->>'x-shadow-user-id')::uuid;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_id_posts on posts;
create trigger set_user_id_posts before insert on posts for each row execute function set_user_id();

drop trigger if exists set_user_id_comments on comments;
create trigger set_user_id_comments before insert on comments for each row execute function set_user_id();

drop policy if exists "Universal Read" on posts;
drop policy if exists "Universal Insert" on posts;
drop policy if exists "Universal Delete" on posts;
drop policy if exists "Universal Read Comments" on comments;
drop policy if exists "Universal Insert Comments" on comments;
drop policy if exists "Universal Delete Comments" on comments;

create policy "Universal Read" on posts for select using (true);
create policy "Universal Insert" on posts for insert with check (true);
create policy "Universal Delete" on posts for delete using ((auth.uid() = user_id) OR (auth.uid() IS NULL AND ((current_setting('request.headers', true)::json->>'x-shadow-user-id')::uuid = user_id)));

create policy "Universal Read Comments" on comments for select using (true);
create policy "Universal Insert Comments" on comments for insert with check (true);
create policy "Universal Delete Comments" on comments for delete using ((auth.uid() = user_id) OR (auth.uid() IS NULL AND ((current_setting('request.headers', true)::json->>'x-shadow-user-id')::uuid = user_id)));
`;
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAiPrompt = () => {
      const prompt = `I am building a React app with Supabase. I have a specific requirement for "Guest/Shadow" authentication using HTTP Headers.

Please write a PostgreSQL script that:
1. Creates 'posts' and 'comments' tables with a 'user_id' column (UUID).
2. Enables Row Level Security (RLS).
3. Creates a 'set_user_id' Trigger: On INSERT, if 'auth.uid()' is null, read the 'x-shadow-user-id' HTTP header, cast it to UUID, and save it as 'user_id'.
4. CRITICAL: Creates a DELETE Policy that allows deletion ONLY if the row's 'user_id' matches 'auth.uid()' OR matches the 'x-shadow-user-id' header.

This ensures both logged-in users and guest users (tracked by local storage ID) can delete their own items.`;
      navigator.clipboard.writeText(prompt);
      setAiPromptCopied(true);
      setTimeout(() => setAiPromptCopied(false), 2000);
  };

  const handleTagClick = (tag: string) => {
      const rawTag = tag.replace(/^#/, '');
      setActiveFilter({ type: 'tag', value: rawTag });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUserClick = (user: { userId: string; nickname: string }) => {
      if (!user.userId) return;
      setActiveFilter({ type: 'user', userId: user.userId, nickname: user.nickname });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilter = () => setActiveFilter(null);

  const filteredPosts = useMemo(() => {
      if (!activeFilter) return posts;
      if (activeFilter.type === 'tag') {
          return posts.filter(post => 
              post.tags.some(t => t.toLowerCase() === activeFilter.value.toLowerCase())
          );
      }
      if (activeFilter.type === 'user') {
          return posts.filter(post => post.author.userId === activeFilter.userId);
      }
      return posts;
  }, [posts, activeFilter]);

  const trendingTopics = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach(post => {
        if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach(tag => {
                if(tag) counts[tag] = (counts[tag] || 0) + 1;
            });
        }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 10).map(t => '#' + t[0]);
  }, [posts]);

  const isOwner = (post: Post) => {
    if (!authUserId) return false;
    return post.author.userId === authUserId;
  };

  const statusColor = authUserId && !authUserId.includes('-') && authUserId.length > 30
      ? 'text-green-500' 
      : 'text-yellow-500';

  return (
    <div className="min-h-screen transition-colors duration-300 bg-[#FAFAFA] text-neutral-900 dark:bg-[#050505] dark:text-white overflow-hidden">
      
      {/* Sticky Header */}
      <header className="fixed top-0 z-50 w-full backdrop-blur-xl bg-white/80 dark:bg-black/80 border-b border-neutral-200 dark:border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <div 
                onClick={() => { clearFilter(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex items-center gap-2 cursor-pointer group"
            >
                <span className="font-bold text-xl tracking-tight">Echo</span>
            </div>

            <div className="flex items-center gap-3">
                <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className={`p-2 rounded-full transition-colors ${showDebug ? 'bg-neutral-100 dark:bg-white/10 text-black dark:text-white' : 'text-neutral-400 hover:text-black dark:hover:text-white'}`}
                >
                    <Info size={20} />
                </button>
                <button 
                    onClick={toggleTheme} 
                    className="p-2 rounded-full text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
                >
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </div>
        </div>
      </header>
      
      {/* Optimized Pull To Refresh Indicator */}
      <div 
        ref={refreshIndicatorRef}
        className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
        style={{ 
            top: '74px', // Start hidden or just at edge
            opacity: 0,
            transform: 'scale(0.5)'
            // Transition is handled by refs in JS
        }}
      >
        <div 
            className="bg-white dark:bg-[#1E1E1E] rounded-full p-2.5 shadow-md border border-neutral-100 dark:border-neutral-700 flex items-center justify-center"
        >
            {isRefreshing ? (
                <Loader2 size={20} className="text-black dark:text-white animate-spin" />
            ) : (
                <div ref={refreshIconRef}>
                    <ArrowDown size={20} className="text-black dark:text-white" />
                </div>
            )}
        </div>
      </div>

      {/* Main Content Wrapper */}
      <main 
        ref={mainContentRef}
        className="max-w-2xl mx-auto px-4 py-8 pt-24 min-h-screen relative"
        // Style handled by JS refs for performance
      >
        
        {/* Error Banner */}
        {errorMsg && (
            <div className="mb-8 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200 shadow-sm animate-in slide-in-from-top-4">
                <div className="flex items-start gap-3">
                    <XCircle className="shrink-0 mt-0.5" size={20} />
                    <div className="space-y-2 w-full">
                        <h3 className="font-bold text-sm">Connection Error</h3>
                        <p className="text-xs opacity-90 font-mono break-all">{errorMsg}</p>
                        {(errorMsg.includes("column") && errorMsg.includes("does not exist")) && (
                            <div className="mt-3 p-2 bg-white/50 dark:bg-black/20 rounded border border-red-200 dark:border-red-800/50 text-xs">
                                <strong>Tip:</strong> Database schema issue detected. Click "Copy SQL Fix".
                            </div>
                        )}
                        <button 
                            onClick={copySQL}
                            className="mt-2 text-xs bg-white dark:bg-black px-3 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30 font-medium flex items-center gap-2 w-fit hover:border-red-300 transition-colors"
                        >
                            {copied ? <Check size={12} className="text-green-500" /> : <Database size={12} />}
                            {copied ? 'SQL Copied' : 'Copy SQL Fix'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Debug / Status Panel */}
        {showDebug && (
            <div className="mb-8 p-6 rounded-[32px] bg-white dark:bg-[#0F0F0F] border border-neutral-200 dark:border-neutral-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">System Status</h3>
                    <div className={`flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 ${statusColor}`}>
                        <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        {authUserId && !authUserId.includes('-') && authUserId.length > 30 ? 'AUTHENTICATED' : 'SHADOW MODE'}
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-1">User ID</div>
                        <code className="text-xs font-mono bg-neutral-100 dark:bg-black px-2 py-1 rounded block overflow-hidden text-ellipsis">{authUserId || 'Loading...'}</code>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider mb-2">Supabase Tools</div>
                        <div className="flex flex-col gap-2">
                             <button 
                                onClick={copySQL}
                                className="text-xs flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black rounded-full font-medium active:scale-95 transition-transform w-full justify-center"
                            >
                                {copied ? <Check size={14} className="text-green-500" /> : <Terminal size={14} />}
                                {copied ? 'Copied SQL' : 'Copy SQL Script'}
                            </button>
                            <button 
                                onClick={copyAiPrompt}
                                className="text-xs flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-white rounded-full font-medium active:scale-95 transition-transform w-full justify-center"
                            >
                                {aiPromptCopied ? <Check size={14} className="text-green-500" /> : <Bot size={14} />}
                                {aiPromptCopied ? 'Copied Prompt' : 'Copy Prompt for Supabase AI'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Input Area (Hidden if filtering) */}
        {!activeFilter && !isAuthLoading && (
            <>
                <CreatePost onPost={handleUserPost} defaultNickname={currentUserNickname} />
                
                {trendingTopics.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-4 pt-2 no-scrollbar mask-gradient">
                        <div className="flex items-center gap-2 pr-4">
                            <Sparkles size={14} className="text-neutral-400" />
                            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider whitespace-nowrap">Trending:</span>
                        </div>
                        {trendingTopics.map((topic, i) => (
                            <button
                                key={i}
                                onClick={() => handleTagClick(topic)}
                                className="px-3 py-1.5 rounded-full bg-white border border-neutral-200 text-xs font-medium text-neutral-600 hover:border-black hover:text-black whitespace-nowrap transition-all
                                        dark:bg-[#111] dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-white dark:hover:text-white"
                            >
                                {topic}
                            </button>
                        ))}
                    </div>
                )}
            </>
        )}

        {/* Active Filter Banner */}
        {activeFilter && (
            <div className="mb-6 flex items-center justify-between p-1 pl-1 pr-4 rounded-full bg-black text-white dark:bg-white dark:text-black animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-white/20 dark:bg-black/10">
                        {activeFilter.type === 'tag' ? <Hash size={20} /> : <AtSign size={20} />}
                    </div>
                    <div>
                        <div className="text-[10px] uppercase font-bold opacity-60 tracking-wider">
                            {activeFilter.type === 'tag' ? 'Viewing Tag' : 'Viewing User'}
                        </div>
                        <h3 className="font-bold text-sm">
                            {activeFilter.type === 'tag' ? `#${activeFilter.value}` : activeFilter.nickname}
                        </h3>
                    </div>
                </div>
                <button onClick={clearFilter} className="p-2 rounded-full hover:bg-white/20 dark:hover:bg-black/10 transition-colors">
                    <X size={18} />
                </button>
            </div>
        )}

        {/* Feed */}
        <div className="space-y-4 min-h-[50vh]">
            {(isLoading || isAuthLoading) && posts.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-50 space-y-4">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm font-medium">Loading feed...</p>
                 </div>
            ) : filteredPosts.length === 0 ? (
                <div className="text-center py-20 opacity-60">
                    <div className="text-4xl mb-4 grayscale flex justify-center">
                        {activeFilter ? (activeFilter.type === 'tag' ? '🔭' : '👤') : '🎙️'}
                    </div>
                    <h2 className="text-lg font-medium mb-1">
                        {activeFilter ? 'No signals found' : 'Echo is quiet'}
                    </h2>
                    <p className="text-sm text-neutral-500">
                        {activeFilter 
                            ? (activeFilter.type === 'tag' ? `Be the first to tag #${activeFilter.value}` : `No posts from ${activeFilter.nickname} yet`)
                            : 'Start the conversation'}
                    </p>
                    {activeFilter && (
                        <button onClick={clearFilter} className="mt-4 text-sm font-bold underline hover:text-black dark:hover:text-white">
                            View All Posts
                        </button>
                    )}
                </div>
            ) : (
                filteredPosts.map(post => (
                    <PostCard 
                        key={post.id} 
                        post={post} 
                        isUser={isOwner(post)} 
                        currentUserId={authUserId}
                        onDelete={handleDeletePost}
                        onTagClick={handleTagClick}
                        onUserClick={handleUserClick}
                    />
                ))
            )}
        </div>

        {/* Footer */}
        <footer className="mt-20 py-8 border-t border-neutral-100 dark:border-white/5 flex flex-col items-center gap-4 text-neutral-400">
            <div className="flex items-center gap-2 text-xs font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live Connection
            </div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">
                ECHO by iter • DECENTRALIZED FEED
            </p>
        </footer>

      </main>
    </div>
  );
}