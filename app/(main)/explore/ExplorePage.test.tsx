import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { DiscoverData } from "@/lib/discoverData";
import type { PostCardData } from "@/components/post/PostCard";
const mocks = vi.hoisted(() => ({ getData:vi.fn(), user: {id:"viewer"} as {id:string} | null }));
vi.mock("@/lib/supabase/server", () => ({createClient:async () => ({auth:{getUser:async () => ({data:{user:mocks.user}})}})}));
vi.mock("@/lib/discoverData", () => ({ getDiscoverData:mocks.getData, getDiscoverTab:(tab:string) => ["trending", "topics", "people"].includes(tab) ? tab : "for-you" }));
vi.mock("@/components/retention/RetentionEventTracker", () => ({default:()=>null}));
vi.mock("@/lib/activationEvents", () => ({ trackActivationEvent:vi.fn() }));
vi.mock("@/lib/useViewImpression", () => ({ useViewImpression:vi.fn() }));
vi.mock("@/components/ui/FollowButton", () => ({default:()=> <button className="rounded-full bg-emerald-brand px-3.5 py-1.5 text-xs font-semibold text-white">Follow</button>}));
vi.mock("@/app/(main)/settings/profileActions", () => ({setProfileInterests:vi.fn()}));
import ExplorePage from "./page";
const posts: PostCardData[] = [
 {id:"p1", slug:"farmer-interviews", title:null, excerpt:"Reading through smallholder farmer interviews from the Rift Valley project — the recurring theme isn't drought, it's access to storage. Everyone has a plan for the rain. Almost no one has a plan for the harvest after.", content_kind:"post", tags:["Agriculture"], published_at:null,created_at:"2026-10-02T05:00:00Z", profiles:{username:"amarachen",full_name:"Amara Chen",avatar_url:null}, like_count:42, comment_count:8},
 {id:"p2", slug:"apprenticeship", title:"The Quiet Return of Apprenticeship Economies", excerpt:"As formal job markets stall across the continent, informal mentorship networks are quietly rebuilding the ladder into skilled trades.",content_kind:"article",tags:[],word_count:1400,published_at:null,created_at:"2026-10-02T02:00:00Z", profiles:{username:"kboateng",full_name:"Kwame Boateng",avatar_url:null},like_count:128,comment_count:34},
 {id:"p3", slug:"digital-literacy",title:null,excerpt:"Unpopular opinion: most digital literacy curricula teach interfaces, not judgment. Kids can use an app in ten minutes. Knowing when NOT to trust what it tells them takes years we're not spending.",content_kind:"post",tags:["Education"],published_at:null,created_at:"2026-10-01T07:00:00Z",profiles:{username:"fndiaye",full_name:"Fatima Ndiaye",avatar_url:null},like_count:89,comment_count:21}
];
const data: DiscoverData = {userInterests:["Technology"],followedIds:[],forYou:{posts,hasMore:true,nextCursor:"initial"},trending:{posts,hasMore:true,nextCursor:"weekly"},topics:["Technology","Culture","Education","Agriculture","Public Health","Governance","Climate","Literature"].map((tag,i)=>({tag,count:312-i*30,followed:i===0})),people:posts.map((p,i)=>({id:`writer-${i}`,username:p.profiles!.username,full_name:p.profiles!.full_name,avatar_url:null,sharedTopic:null,lastPublishedAt:null,followed:false})).concat([{id:"writer-4",username:"talabi",full_name:"Tunde Alabi",avatar_url:null,sharedTopic:null,lastPublishedAt:null,followed:false}]),peopleReason:"Recent writers"};
it("replaces the shelf when the route content filter changes", async () => {
 mocks.user={id:"viewer"};mocks.getData.mockResolvedValue(data);
 const {rerender}=render(await ExplorePage({searchParams:Promise.resolve({})}));
 expect(screen.getByText(/Reading through smallholder/)).toBeInTheDocument();
 mocks.getData.mockResolvedValue({...data,forYou:{posts:[{...posts[1],title:"Fresh filtered article"}],hasMore:false,nextCursor:null}});
 rerender(await ExplorePage({searchParams:Promise.resolve({type:"article"})}));
 expect(screen.getByText("Fresh filtered article")).toBeInTheDocument();
 expect(screen.queryByText(/Reading through smallholder/)).not.toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Load more"})).not.toBeInTheDocument();
});
it("preserves the active content filter in Trending links and submits search", async () => {
 mocks.getData.mockResolvedValue(data);
 render(await ExplorePage({searchParams:Promise.resolve({type:"article"})}));
 expect(screen.getByRole("link",{name:"Trending"})).toHaveAttribute("href","/explore?tab=trending&type=article");
 const input=screen.getByRole("searchbox");fireEvent.change(input,{target:{value:"education"}});
 expect(input.closest("form")).toHaveAttribute("action","/search");
 expect(input).toHaveAttribute("name","q");
});
it("renders every tab and guest state with real page components; optionally emits visual fixtures", async () => {
 mocks.getData.mockResolvedValue(data);
 for(const guest of [false,true]) for(const tab of ["for-you","trending","topics","people"]) {
   mocks.user=guest ? null : {id:"viewer"};
   const element=await ExplorePage({searchParams:Promise.resolve({tab})});
   const html=renderToStaticMarkup(element);
   expect(html).toContain("Find ideas worth engaging with");
   if(process.env.EXPLORE_VISUAL_OUTPUT) {
     mkdirSync(process.env.EXPLORE_VISUAL_OUTPUT,{recursive:true});
     writeFileSync(`${process.env.EXPLORE_VISUAL_OUTPUT}/${tab}-${guest ? "guest" : "member"}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fonts.css"></head><body><header class="app-utility-header flex items-center px-4"><strong>Indegenius</strong><span class="ml-3 text-sm text-ink-muted">Explore</span></header><main class="app-shell-with-rail app-shell-explore">${html}</main></body></html>`);
   }
 }
});
