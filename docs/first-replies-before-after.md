# first replies: before / after

The first round of replies to each example chip, old engine vs new. Model: Sonnet 5.5 (medium effort; first batch of up to 3 replies at low effort), Haiku for helpers. All runs are real API calls with a guest-style pod (`selectPod([tag], 7)`, user name "Arnav"), made with `scripts/first-round-eval.ts`.

**Pick per cue:** each cue has 3 takes (A/B/C) in `src/lib/first-round-cues.ts`; each take ran twice (first-batch effort `low`, the shipped default, and `medium`). To lock in takes, set that cue's `chosen` to 1-2 take ids (with two, each chat picks one at random). Current picks: `first-replies-picks.md`. To keep a single good line, put it in that friend's `angle`.

**Stickers:** every candidate names the exact `MEME_TEMPLATES` id (stickers branch, `chat-media.ts`) and caption. The sticker isn't rendered yet: the plan rides on the message as `mediaPlan` until the stickers branch is merged (see the `TODO(stickers)` in `orchestrator.ts`).

**What changed (all rounds):**
- Speaker floor: a round never picks just 1 friend (it used to end after 1 message). Typed first messages get 3-4 friends; chips get their planned cast of 3-4.
- First round: everyone picked gets a say, nobody lurks, max ~6 replies + 1 closing question.
- Only the closer asks the user a question (old rounds were 3-4 friends all asking "what did she text?").
- Stock-line ban + retry ("literally did this", "did this exact thing", "the real question is", ...). Priya's copied example line is gone and she's less chatty (talkativeness 0.8 → 0.6).
- Vote card: only when there's a real choice (chip plan, or the classifier's new `choice` flag); question is asked to the user as "you", never "should Arnav / should he".
- Temperature isn't a lever: Sonnet 5.5 runs with thinking on, which fixes temperature.

**Scorecard (48 new chip rounds vs 16 old):** min friends per round 3 (old: 1), sticker moment 48/48 (old: 0), rounds with a stock line 0 (old: 7/16, mostly Priya's "literally did this / regretted it so hard"), card question about the user in 3rd person 0 (old: 16/16, "should Arnav..."). Priya appears in 8/48 new rounds, only where a take casts her.


---

## 1. "My friend owes me 15k and keeps posting Goa stories"

### old round 1 (1 friends, 1 msgs)

> **Sneha:** stop watching their stories and just text them asking for the 15k today

**Vote card:** "How should Arnav get his ₹15k back from his friend?" → Text them directly and ask now · Stop following their stories and chill · Call them up and talk it out

### old round 2 (3 friends, 5 msgs)

> **Pradeep:** text them tonight, ask for it by friday
> **Noor:** if he can afford goa he can afford ₹15k, screenshot the stories as proof when you ask
> **Pradeep:** skip the screenshots, just ask for the money
> **Noor:** how long has he owed you the 15k
> **Arjun:** did he say when he'd pay, or is he just ghosting the topic?

**Vote card:** "How should Arnav get his ₹15k back from his friend?" → Just text and ask directly · Call out the Goa flex · Figure out his actual status

### candidate 1: take A, first-batch effort low

*roast the Goa flex with rupee math, then a petty-but-real plan*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Noor:** bro your 15k is currently a beer bucket tower, 3 shack lunches and that parasailing video he posted twice. at goa prices that's like 4 nights in a north goa hostel plus a scooter rental. he's not broke, he just reallocated your money to his own portfolio  
> 🖼️ *sticker `stonks` — caption: "lending 15k to a friend / sponsoring his goa trip"*
> **Suresh:** lent 8k once, he went to goa too. i funded his beach shack dreams lol
> **Pradeep:** reply to his goa story with a ₹15,000 UPI request
> **Lalitha:** set a payment date, like friday 6pm, and text him "hey need the 15k by friday" before he posts another sunset
> **Pradeep:** friday 6pm is fine but a date means nothing without consequences
> **Lalitha:** fair, consequence is simple: no payment, you screenshot the stories
> **Noor:** lol fair. how long ago did he borrow it, and has he even mentioned it since?

**Vote card:** "how do you get your 15k back from your mate before he blows it all in Goa?" → Set a hard deadline with consequences · Call him out publicly on his posts · Just vent and move on

### candidate 2: take A, first-batch effort medium

*roast the Goa flex with rupee math, then a petty-but-real plan*. 4 friends, 8 msgs, sticker by Noor, ends on a question: yes.

> **Noor:** 15k is like 20 beer buckets or the parasailing plus 3 shack dinners  
> 🖼️ *sticker `stonks` — caption: "lending 15k to a friend / sponsoring his goa trip"*
> **Suresh:** lent 8k once, guy went to goa the next month. my money funded his sunsets lol
> **Pradeep:** reply to his goa story with a ₹15,000 UPI request
> **Lalitha:** set a deadline, friday, then text "₹15k by friday or the goa stories get screenshotted"
> **Pradeep:** friday works, but screenshots are a bluff. just send it
> **Lalitha:** fair, but the deadline makes the bluff look serious
> **Suresh:** chased 12k for a year once, ended up paying for his birthday dinner lol
> **Noor:** how long ago did he borrow it, has he brought it up since?

**Vote card:** "how do you get your ₹15k back from your friend?" → call him out publicly · set a hard deadline · ask him directly first · just let it go

### candidate 3: take B, first-batch effort low

*UPI-QR-on-his-story bit as the hero, Hera Pheri GIF*. 4 friends, 7 msgs, sticker by Arjun, ends on a question: yes.

> **Pradeep:** reply to his goa story with your upi qr code. no caption needed. 15k is a lot of beach shacks
> **Arjun:** dm first, then reply to his story, then tag him in the group. goa budget is clearly fine  
> 🖼️ *gif `paisa-hi-paisa` (GIF, no caption; the text above carries it)*
> **Suresh:** lent 20k once and waited 3 months to ask. by then it was "bro we're friends why are you counting" lol. ask now
> **Noor:** 15k is like 30 beer buckets at baga, he clearly did the math and chose beer
> **Suresh:** lmao and he'll post the hangover story next
> **Pradeep:** suresh is right, 3 months in and it becomes "why are you counting." send the qr tonight, not "this weekend"
> **Arjun:** does he pay when shamed or get defensive?

**Vote card:** "how do you get your ₹15k back from him?" → Call him out publicly · DM him first, one-on-one · Ask him straight up, tonight · Let it go and move on

### candidate 4: take B, first-batch effort medium

*UPI-QR-on-his-story bit as the hero, Hera Pheri GIF*. 4 friends, 7 msgs, sticker by Arjun, ends on a question: yes.

> **Pradeep:** reply to his goa story with your upi qr code. no caption, no text, just the qr. 15k is paying for his sunset
> **Arjun:** dm first, then reply to his story, then tag him in the group  
> 🖼️ *gif `paisa-hi-paisa` (GIF, no caption; the text above carries it)*
> **Suresh:** nah 15k and he's posting goa stories is wild. when i lent 20k to a friend and waited "till he's comfortable", it turned into "bro we're friends why are you counting" lol. send a calm upi request today with a "hey need this back" note, the longer you wait the weirder it gets
> **Noor:** 15k is like 30 beer buckets at baga and he clearly picked the buckets
> **Suresh:** noor's math is right, goa has cost me way more than 15k lol
> **Pradeep:** suresh is right, send the request tonight, no waiting
> **Arjun:** lmao noor's buckets 💀 does he pay if shamed or get defensive?

**Vote card:** "how do you get your ₹15k back from your friend who's posting Goa stories?" → Send a direct UPI request tonight · Reply to his Goa story with your QR code · DM, then story reply, then group tag · Call him out about the Goa flex

### candidate 5: take C, first-batch effort low

*a split: one says go soft, one says go public, Drake sticker*. 3 friends, 7 msgs, sticker by Sneha, ends on a question: no.

> **Lalitha:** send one polite text with a date. 15k, he's in goa, he can upi from a beach
> **Sneha:** he's not forgetting, he's posting  
> 🖼️ *sticker `drake` — caption: "asking nicely for the 15k / commenting 'nice view' on every goa story"*
> **Noor:** his goa trip cost more than 15k, you're the sponsor
> **Sneha:** sponsor is generous, he's basically paying you in sunset pics
> **Lalitha:** lmao beach wifi is clearly working, upi should too
> **Noor:** 15k is a flight plus two nights, he's literally posting your money 💀
> **Lalitha:** lmao the stories are the receipts. is he a close friend or a we used to be close one

**Vote card:** "how do you get your 15k back from him?" → send a polite text with a deadline · call him out publicly on the posts · accept that he's not paying you back

### candidate 6: take C, first-batch effort medium

*a split: one says go soft, one says go public, Drake sticker*. 3 friends, 7 msgs, sticker by Sneha, ends on a question: yes.

> **Lalitha:** 15k and he's posting goa stories lol, send one nice text with a date, people forget
> **Sneha:** he knows. he's posting, not forgetting  
> 🖼️ *sticker `drake` — caption: "asking nicely for the 15k / commenting 'nice view' on every goa story"*
> **Noor:** that goa trip probably cost him 15k easy, so he's literally spending your money on beach shacks
> **Sneha:** the real problem is you let it get to 15k before saying anything. next time it's 2k and you ask on day one
> **Lalitha:** sneha's right but also 15k is a lot to be cool about lol
> **Noor:** lalitha's right, 15k is like 3 months of his swiggy budget, and he's still posting
> **Lalitha:** lol he's out here funding his beach shacks with your money. is he a close friend or a we used to be close one?

**Vote card:** "how do you get your ₹15k back from your friend?" → Send a direct text with a deadline · Call him out publicly on his posts · Let it go and learn for next time · Figure out if he's still a real friend first


---

## 2. "Mom set up a rishta meeting this Sunday. Do I go?"

### old round 1 (3 friends, 6 msgs)

> **Shekhar:** do you actually want to meet her or do you just not want to fight your mom
> **Divya:** you're not scared of meeting her, you're scared that saying yes means mom won.
> **Priya:** literally just go, it's one chai and an hour of your life. i got set up with a guy last year and spent the whole time sketching his terrible shirt on a napkin under the table lol. best part of the day was the shirt, but i got free food and my mom stopped nagging for a month. nobody's making you say yes, you can just go and judge the snacks.
> **Shekhar:** if mom hadn't set it up, would you be dating?
> **Priya:** wait what's actually bothering you about it, the meeting or the whole mom-setting-it-up thing?
> **Divya:** shekhar's question is the real one, he just asked it nicely. i think the answer is no

**Vote card:** "should arnav go to the rishta meeting his mom set up" → just go, it's not a big deal · skip it, be honest with mom

### old round 2 (3 friends, 6 msgs)

> **Priya:** literally went to one last year and it was just chai and awkward silence, go
> **Meera:** only go if YOU want to, not because mom set it up. SUNDAY IS YOURS. and if it's just chai and awkward silence like priya said, you can walk out after 20 mins and nobody can stop you 😤
> **Divya:** you're not asking if you should go, you're asking if saying yes means you've given up
> **Meera:** wait arnav what's actually bothering you about it?
> **Divya:** is it the meeting itself or that your mom already decided how this ends
> **Priya:** meera's 20 min rule is actually genius. i did that once and used a fake "my cab is here" call, worked perfectly, zero guilt lol

**Vote card:** "Should Arnav go to the rishta meeting his mom set up on Sunday?" → Go and commit to it · Go but keep it short · Skip it and talk to your mom

### candidate 1: take A, first-batch effort low

*go-for-the-samosas chaos vs the uncomfortable truth, Drake sticker*. 4 friends, 8 msgs, sticker by Meera, ends on a question: no.

> **Meera:** GO. FREE SAMOSAS AND YOU GET TO JUDGE THE AUNTY'S SOFA COVERS  
> 🖼️ *sticker `drake` — caption: "fighting mom for 3 weeks / 1 hour of chai and free samosas"*
> **Sneha:** go. one chai isn't a wedding, relax
> **Shekhar:** sunday rishta meeting, mom's been planning this since like tuesday
> **Tanmay:** worst case they're actually cool and you have to tell mom she was right
> **Sneha:** planned since tuesday means she already picked the outfit too
> **Meera:** tanmay shut up, mom being right is NOT happening
> **Shekhar:** telling mom she was right is the real punishment lmao
> **Tanmay:** lmao sunday already booked. did mom send you the biodata photo yet, what was the vibe

**Vote card:** "do you go to the rishta meeting on Sunday?" → Just go · Go and actually engage · Skip it

### candidate 2: take A, first-batch effort medium

*go-for-the-samosas chaos vs the uncomfortable truth, Drake sticker*. 4 friends, 7 msgs, sticker by Meera, ends on a question: no.

> **Meera:** GO. and rate the aunty's sofa covers out loud  
> 🖼️ *sticker `drake` — caption: "fighting mom for 3 weeks / 1 hour of chai and free samosas"*
> **Sneha:** go, it's one chai not a wedding
> **Shekhar:** sunday rishta meeting, so mom already booked the chai and the samosas before even asking you 💀
> **Tanmay:** real risk isn't going, it's them being actually cool and you telling mom she was right
> **Meera:** 💀 the samosas alone justify the trip
> **Shekhar:** tanmay's right, you're cooked if she's normal 💀
> **Sneha:** lol tanmay's right. did mom send the biodata photo yet? what was the vibe

**Vote card:** "do you go to the rishta meeting on Sunday?" → Go for it · Go but keep it light · Go and risk proving mom right

### candidate 3: take B, first-batch effort low

*panik-kalm-panik arc, ends on the mom-already-told-everyone twist*. 4 friends, 6 msgs, sticker by Tanmay, ends on a question: no.

> **Tanmay:** sunday 11:40 you're already rehearsing your hobbies in the mirror  
> 🖼️ *sticker `panik-kalm-panik` — caption: "mom set up a rishta / it's just one chai / mom already told masi"*
> **Sneha:** go. be honest, leave. it's one afternoon
> **Meera:** GO but we are planning the escape first, someone calls him at the 40 minute mark with a fake emergency
> **Shekhar:** if someone else is already on your mind, the decision got made before mom even called
> **Sneha:** fake emergency is cheating, just tell her you're leaving
> **Meera:** WAIT so someone IS on his mind?? who is this person, why am i finding out from shekhar

**Vote card:** "do you go to the rishta meeting on Sunday?" → Just go, be honest, leave · Go but plan a fake escape · Don't go, you're not interested

### candidate 4: take B, first-batch effort medium

*panik-kalm-panik arc, ends on the mom-already-told-everyone twist*. 4 friends, 7 msgs, sticker by Tanmay, ends on a question: no.

> **Tanmay:** sunday is already ruined bro. 11am you're picking a shirt, 1pm you're rehearsing hobbies, 4pm you're sitting there while two moms judge your chai sipping  
> 🖼️ *sticker `panik-kalm-panik` — caption: "mom set up a rishta / it's just one chai / mom already told masi"*
> **Sneha:** go, be honest, leave. it's one afternoon
> **Meera:** GO but we're planning the escape first, someone calls you at the 40 minute mark SHARP, fake emergency ready.
> **Shekhar:** you're only asking because there's someone else you'd rather be sitting across from on sunday
> **Meera:** SHEKHAR STOP, you're making him sound guilty when his mom is the one who ambushed him with a rishta.
> **Sneha:** fake emergency is lame, just leave honestly like an adult
> **Tanmay:** lmao the escape plan debate is funnier than the meeting itself. has your mom already told the relatives or is it still classified

**Vote card:** "do you go to the rishta meeting on Sunday?" → Go and just leave early · Go with an escape plan ready · Skip it, Sunday's already lost

### candidate 5: take C, first-batch effort low

*the fake-call exit plan, Hera Pheri 'mast plan' GIF*. 4 friends, 8 msgs, sticker by Divya, ends on a question: no.

> **Meera:** SUNDAY?? she gave you 4 days notice. set the fake flat flooding call for 7:40 and go
> **Divya:** go, but show up as yourself and not whatever mom's rishta biodata says you are  
> 🖼️ *gif `mast-plan` (GIF, no caption; the text above carries it)*
> **Priya:** go, free chai. mine's dad talked ranji trophy for an hour
> **Sneha:** fake flood is cowardly, just say no thanks after
> **Meera:** priya's dad got an hour of ranji trophy, you could get the whole family tree and her cousin's CA results 💀 bring snacks money for yourself
> **Sneha:** meera, a fake flood is how you end up lying to a stranger's whole family on day one
> **Priya:** lmao the aunty who set it up will know the outcome before you even get home
> **Divya:** lol the aunty already knows. what do you tell mom when she asks "so? did you like?"

**Vote card:** "do you go to the rishta meeting on Sunday?" → Go and be yourself · Go for the free chai and experience · Skip it with a direct no · Fake an emergency to bail

### candidate 6: take C, first-batch effort medium

*the fake-call exit plan, Hera Pheri 'mast plan' GIF*. 4 friends, 8 msgs, sticker by Divya, ends on a question: no.

> **Meera:** GO but we set up the exit plan, I'll call at 7:40 screaming "FLAT IS FLOODING" lol
> **Divya:** go, but show up as you, not mom's bio of you  
> 🖼️ *gif `mast-plan` (GIF, no caption; the text above carries it)*
> **Priya:** go, just for the chai. my cousin's rishta uncle spent 40 minutes ranking dhoni captaincy eras and she never spoke
> **Sneha:** fake call is dumb, just say no thanks after, you're an adult
> **Meera:** 40 MINUTES on dhoni eras?? if that uncle tries it on you i'm walking in and ending him
> **Sneha:** meera you'd get thrown out in 5 minutes 💀
> **Divya:** meera ending a stranger over dhoni eras is the most loyal thing i've heard all week
> **Priya:** lmao meera vs the dhoni uncle is the fight i'd pay for, but what do you tell mom when she asks "so? did you like?"

**Vote card:** "do you go to the rishta meeting on Sunday?" → Go and be yourself · Go for the experience · Skip it


---

## 3. "Boss texts me on Sunday nights. Reply or ignore?"

### old round 1 (3 friends, 6 msgs)

> **Suresh:** replied every sunday for 2 years. never got promoted
> **Tanmay:** the real question is whether he texts because he needs you or because he's bored
> **Noor:** sunday replies are free hours you're donating. are you paid for them or is it just vibes
> **Tanmay:** wait what does he actually text, like "call me" or just random stuff?
> **Suresh:** arnav what's he usually texting, actual work stuff or just random sunday thoughts?
> **Noor:** how many sunday hours a month is that though, and does it ever turn into overtime pay or a raise

**Vote card:** "Should Arnav reply to his boss's Sunday texts or ignore them?" → Always reply, stay visible · Ask what he actually needs · Don't give free hours unpaid

### old round 2 (3 friends, 6 msgs)

> **Lalitha:** depends what it says, if it can wait till monday ignore it, if there's a deadline reply
> **Noor:** unpaid overtime is a pay cut. is he paying for sundays?
> **Tanmay:** the real problem isn't the reply, it's that he knows you'll see it on sunday night. that's the whole point of the text
> **Lalitha:** tbh just set a rule, no replies after 9pm unless it has a deadline, then stick to it
> **Noor:** sunday night texts are free marketing for his stress
> **Tanmay:** rules only work if the boss knows them, and a secret rule is just you ghosting him with extra steps

**Vote card:** "How should Arnav handle his boss texting him on Sunday nights?" → Reply based on urgency · Set a boundary and tell him · Don't reply unless paid

### candidate 1: take A, first-batch effort low

*Monday-9am 'noted 👍' bit, unpaid-hours math, This-is-fine sticker*. 4 friends, 7 msgs, sticker by Farhan, ends on a question: yes.

> **Farhan:** reply at 9:01 monday. "noted 👍"  
> 🖼️ *sticker `this-is-fine` — caption: "sunday 10:47pm / 'hey quick one' from boss"*
> **Suresh:** replied every sunday night for 2 years, promotion went to the guy who never did
> **Shekhar:** sunday night "quick one" is never quick, it's a 10:47pm ticket to ruin your monday
> **Pradeep:** phone on dnd after 9, reply monday, done
> **Farhan:** suresh's promotion story is just one guy's luck, the other guy probably had a cousin on the board
> **Shekhar:** dnd is fine but "reply monday" only works if your boss isn't the type to notice
> **Suresh:** lol farhan has a point about the cousin, but what did the last sunday text actually say?

**Vote card:** "do you reply to your boss's sunday night text right away or wait till monday?" → reply sunday night with a quick ack · reply monday morning · don't reply at all

### candidate 2: take A, first-batch effort medium

*Monday-9am 'noted 👍' bit, unpaid-hours math, This-is-fine sticker*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Farhan:** reply, but wait till 9:01 monday and just send "noted 👍". sunday night texts are a test, and you just failed it by being available
> **Noor:** every sunday reply is unpaid overtime, tiny pay cut weekly  
> 🖼️ *sticker `this-is-fine` — caption: "sunday 10:47pm / 'hey quick one' from boss"*
> **Shekhar:** read what the text actually says first. "quick one" at 10:47pm is never quick, it's a 40 min task wearing a disguise
> **Pradeep:** phone on dnd after 9, answer monday, done
> **Shekhar:** pradeep's dnd plan only works if the boss doesn't also text on monday at 9:02 asking why you ignored him
> **Farhan:** nah shekhar, 10:47pm "quick one" is a hostage video, and replying just pays the ransom
> **Noor:** lol shekhar's 9:01 plan is cute. what did the last sunday text actually say?

**Vote card:** "do you reply to your boss's sunday night text?" → Reply Monday morning at 9:01 · Check the text first, then decide · Ignore till Monday with DND on · Don't reply, it's unpaid work

### candidate 3: take B, first-batch effort low

*DND loophole, Roll-safe sticker*. 4 friends, 7 msgs, sticker by Pradeep, ends on a question: yes.

> **Pradeep:** dnd 9pm to 9am, reply monday. done  
> 🖼️ *sticker `roll-safe` — caption: "can't miss boss's sunday text / if your phone is on DND till monday"*
> **Tanmay:** reply once and sunday becomes a workday forever
> **Lalitha:** rule is simple: if it's urgent he calls, a sunday night text can wait till monday morning
> **Farhan:** reply instantly, then ask for a comp-off
> **Lalitha:** comp-off never gets approved, farhan 💀
> **Tanmay:** comp-off is just a myth managers tell interns
> **Pradeep:** lol comp-off myth 💀 does he ever actually need an answer before monday?

**Vote card:** "how do you handle your boss's sunday night texts?" → Ignore till monday morning · Reply right away · Don't reply, break the pattern

### candidate 4: take B, first-batch effort medium

*DND loophole, Roll-safe sticker*. 3 friends, 7 msgs, sticker by Pradeep, ends on a question: yes.

> **Pradeep:** dnd 9pm to 9am. reply monday morning. done  
> 🖼️ *sticker `roll-safe` — caption: "can't miss boss's sunday text / if your phone is on DND till monday"*
> **Tanmay:** reply once and sunday becomes monday part 2 forever
> **Lalitha:** rule i use: urgent means he calls, a sunday night text can wait till monday morning
> **Pradeep:** tanmay's overthinking it. one reply monday morning fixes the pattern
> **Tanmay:** pradeep calling me an overthinker while building a whole monday morning system for one text 💀 the sunday text isn't even about work, it's him checking if you're still reachable. a reply monday morning just tells him the answer is no, which honestly is the point
> **Lalitha:** tanmay's right though, a monday reply is the answer, and sunday night is the only deadline that matters 💀
> **Pradeep:** lol tanmay got me. has he ever actually needed something before monday?

**Vote card:** "do you reply to your boss's sunday night text, or wait till monday?" → Reply Monday morning · Ignore it completely

### candidate 5: take C, first-batch effort low

*fed-up Baburao GIF, Suresh story*. 3 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Suresh:** old boss sent "call me" sunday night. ppt font 💀
> **Noor:** 4 sundays x 1 hour is a free work day a month, are they paying you for it  
> 🖼️ *gif `utha-le` (GIF, no caption; the text above carries it)*
> **Arjun:** ignore sunday, then over-deliver monday 9am. he learns
> **Suresh:** unpaid overtime with extra steps 💀
> **Arjun:** nah suresh it's free only if he replies. ignoring costs nothing, replying sets the precedent
> **Noor:** arjun's plan only works if monday 9am work gets noticed, otherwise you're doing sunday's hour plus extra for free
> **Suresh:** lol arjun's precedent thing is real. does he text the whole team or just you?

**Vote card:** "do you reply to your boss's sunday night texts?" → ignore sunday, deliver hard monday · reply and set the precedent · ignore unless he pays for it

### candidate 6: take C, first-batch effort medium

*fed-up Baburao GIF, Suresh story*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Suresh:** old boss sent "call me" on a sunday once. it was about a ppt font 💀
> **Noor:** 4 sundays x 1 hour is a free work day a month, and he's not even paying you for it  
> 🖼️ *gif `utha-le` (GIF, no caption; the text above carries it)*
> **Shekhar:** sunday night texts hit different when the boss clearly has no plans either, ignoring it is also a reply
> **Arjun:** strategically speaking, never reply sunday night, then send the answer first thing monday at 9am, over-polished. if you reply sunday, he learns you're a 24/7 vending machine. if you ignore it and over-deliver monday, he starts thinking twice before texting. lmao the only exception is if it's actually on fire, which a sunday 10pm text never is.
> **Shekhar:** arjun's plan only works if the boss notices the 9am polish, most bosses just notice the silence
> **Suresh:** replied once at 11pm and became their sunday guy forever 💀
> **Noor:** lmao 11pm guy for life 💀 does he text the whole team on sundays or just you?

**Vote card:** "do you reply to your boss's sunday night texts or wait until monday?" → ignore sunday, reply monday morning polished · reply right away · ignore it completely


---

## 4. "My ex liked my story at 2am. Should I reply?"

### old round 1 (3 friends, 6 msgs)

> **Sneha:** no. a 2am like is just boredom, not a sign
> **Priya:** literally liked my ex's story at 2am once and spiraled for a week, but if you're asking, you already know
> **Divya:** you already want to reply. that's the real question
> **Sneha:** why did you two break up in the first place?
> **Divya:** who ended it though, you or her? that changes what the 2am like means
> **Priya:** wait did you want her to like it though?

**Vote card:** "should arnav reply to his ex's 2am story like?" → don't reply, it's just boredom · reply because you want to anyway

### old round 2 (3 friends, 6 msgs)

> **Sneha:** no. a 2am like means nothing good
> **Priya:** literally liked mine back once and regretted it
> **Divya:** you're not asking if you should reply. you want to be picked
> **Sneha:** why did you two actually break up?
> **Priya:** did you check if they viewed your story first or was that the 2am scroll thing?
> **Divya:** did you want them to see you were awake too

**Vote card:** "Should Arnav reply to his ex's 2am story like?" → Don't reply, ignore it · Reply to show you're awake too · Check their story pattern first

### candidate 1: take A, first-batch effort low

*which-story detective work, panik-kalm-panik sticker*. 4 friends, 8 msgs, sticker by Shekhar, ends on a question: yes.

> **Meera:** WHICH STORY. thirst trap is a different case
> **Sneha:** nah. 2am likes are just boredom with wifi
> **Shekhar:** 2am likes are never random, whoever scrolled back 3 days did it on purpose  
> 🖼️ *sticker `panik-kalm-panik` — caption: "ex liked your story / it's 2am, they're just bored / the story was from 3 days ago"*
> **Divya:** you don't want to reply, you want her to notice you didn't
> **Meera:** BOREDOM?? SNEHA THEY HAD A WHOLE NETFLIX AT 2AM AND CHOSE YOUR STORY. DO NOT REPLY, LET THEM SIT THERE
> **Shekhar:** meera's netflix point is cute but a like costs zero effort, a reply costs you your whole week
> **Sneha:** netflix was open, she just wanted something easy to tap
> **Divya:** okay but what was on the story, and did you post it hoping she'd see it?

**Vote card:** "do you reply to your ex's 2am like?" → Don't reply, make her wait · Don't reply at all · Reply, she clearly meant it

### candidate 2: take A, first-batch effort medium

*which-story detective work, panik-kalm-panik sticker*. 4 friends, 8 msgs, sticker by Shekhar, ends on a question: yes.

> **Meera:** WHICH STORY. if it was a thirst trap that's a different case, 2am like is war
> **Sneha:** no. 2am likes are just boredom with wifi
> **Shekhar:** a 2am like on a 3 day old story means they scrolled all the way back to find you. that's not boredom, that's research  
> 🖼️ *sticker `panik-kalm-panik` — caption: "ex liked your story / it's 2am, they're just bored / the story was from 3 days ago"*
> **Divya:** you don't want to reply, you want her to know you noticed so she misses you
> **Meera:** WIFI DIDN'T CHOOSE YOUR STORY, HE DID
> **Shekhar:** divya's wrong, if he wanted her to miss him he'd have posted a better story, this is just curiosity with no plan
> **Sneha:** divya's right but she's skipping the worse part, replying just resets the clock on whatever you already broke up over
> **Divya:** what was on the story that she woke up for?

**Vote card:** "do you reply to your ex's 2am like?" → Reply and let her know you saw it · Don't reply, just leave it · Ignore it, she's just bored · Don't engage, it's just curiosity

### candidate 3: take B, first-batch effort low

*is-this-closure pigeon sticker, Sneha vs Meera*. 4 friends, 8 msgs, sticker by Divya, ends on a question: yes.

> **Sneha:** no. a 2am like is a thumb, not an apology
> **Meera:** sneha's gonna say ignore it and be mature, boring. 2am like means she's up thinking about you, reply with just 🌚 and let her suffer
> **Divya:** you didn't ask if you should reply, you asked hoping someone would say yes. 2am like is just a thumb that missed you  
> 🖼️ *sticker `is-this-a-pigeon` — caption: "you / a 2am story like / is this closure?"*
> **Shekhar:** depends who ended it, a 2am like from the dumper is guilt and from the dumped is "i'm still here" lmao different situations entirely
> **Meera:** DIVYA STOP EXPOSING HIM, let him have his 🌚
> **Sneha:** meera wants a 🌚 sent, that's how you get 4am "wyd"
> **Shekhar:** lmao 2am means he was scrolling alone in the dark 💀
> **Divya:** shekhar's right for once, so who ended it, and did you check if she liked anyone else's story too?

**Vote card:** "do you reply to your ex's 2am like?" → ignore it completely · send the 🌚 moon emoji · find out who dumped who first

### candidate 4: take B, first-batch effort medium

*is-this-closure pigeon sticker, Sneha vs Meera*. 4 friends, 8 msgs, sticker by Divya, ends on a question: yes.

> **Sneha:** no. a 2am like isn't an apology, it's boredom
> **Meera:** REPLY. 2am means chaos, send a 💀 and watch
> **Divya:** you're asking because you hoped she'd do exactly this 💀  
> 🖼️ *sticker `is-this-a-pigeon` — caption: "you / a 2am story like / is this closure?"*
> **Shekhar:** depends who dumped
> **Meera:** DIVYA NO. the sticker is right though, a 2am like is not closure, it's a doorbell prank 💀
> **Shekhar:** doorbell prank is fair but nobody's mentioned a story like costs her one tap. zero effort, zero intent. don't write a paragraph for a thumb twitch
> **Sneha:** doesn't matter who dumped, the reason hasn't moved
> **Divya:** shekhar's question is the only useful one tho. who ended it?

**Vote card:** "do you reply to your ex's 2am story like?" → Don't reply, it's just boredom · Reply and see what happens · Ask who ended things first

### candidate 5: take C, first-batch effort low

*'Rasode mein kaun tha' GIF: who's up at 2am*. 4 friends, 7 msgs, sticker by Meera, ends on a question: yes.

> **Meera:** 2AM?? nobody likes a story at 2am by accident, they were scrolling your page in bed  
> 🖼️ *gif `rasode` (GIF, no caption; the text above carries it)*
> **Tanmay:** 2am like means she was thinking of you at 2:01 not 2:00
> **Sneha:** don't reply. a 2am like is just a thumb that was bored and lonely, not a message
> **Divya:** you already typed the reply in your head, didn't you
> **Meera:** 2:01 or not, she's still watching your stories at night
> **Sneha:** meera your gif is funny but she can stalk all night and the breakup still happened
> **Tanmay:** meera's right but also a like is free, a reply costs you three days of checking last seen. how long has it been since the breakup?

**Vote card:** "do you reply to her 2am like?" → Don't reply, let it go · Reply, she's clearly thinking of you · Don't reply yet, protect yourself · You already know what you want

### candidate 6: take C, first-batch effort medium

*'Rasode mein kaun tha' GIF: who's up at 2am*. 4 friends, 7 msgs, sticker by Meera, ends on a question: yes.

> **Meera:** 2AM?? NOT a coincidence, they were up thinking about you and don't you dare reply  
> 🖼️ *gif `rasode` (GIF, no caption; the text above carries it)*
> **Tanmay:** 2am like means it was either a drunk thumb or a 1:58 decision and a 2:00 send
> **Sneha:** don't reply. nobody likes a story at 2am for the story, that's a thumb doing a lap. ok fine screenshot it for us
> **Divya:** you already typed the reply in your head lol
> **Meera:** SCREENSHOT IT RIGHT NOW, I NEED TO SEE THIS PERSON'S NAME
> **Sneha:** liking a story is the cheapest thing she can do, it costs her zero rupees and zero effort
> **Tanmay:** everyone's decoding her like it's a data set lol, but how long has it been since you two broke up?

**Vote card:** "do you reply to your ex's 2am story like?" → Don't reply, let it go · Reply and engage · Screenshot it first


---

## 5. "Got a 30% hike offer but the new team seems toxic"

### old round 1 (3 friends, 5 msgs)

> **Shekhar:** toxic how, did you actually meet them or is it just vibes from one interview
> **Suresh:** took a 40% hike once ignoring a toxic team. left in 5 months, the money didn't help
> **Shekhar:** suresh your 5 months proves nothing, did you know it was toxic or just assume
> **Suresh:** fair shekhar, i did know. met two of them in the interview and ignored it. arnav what actually felt off about them?
> **Tanmay:** what's the toxic part, the people or the work itself?

**Vote card:** "Should Arnav take the 30% hike offer despite the toxic team vibes?" → Take it, money matters more · Pass on it, toxic teams suck · Figure out what's actually toxic

### old round 2 (3 friends, 6 msgs)

> **Lalitha:** toxic how though, like actually seen it or just vibes from interviews
> **Arjun:** if the toxicity is the manager, leave in a year. if it's the whole team, 30% won't fix it
> **Lalitha:** true but arnav needs to find out which one before the offer deadline
> **Tanmay:** wait is the 30% worth it or are you just scared of staying where you're comfortable?
> **Arjun:** tanmay chill. arnav what did you actually see on the team?
> **Tanmay:** who did you meet from that team, and did anyone seem happy to be there?

**Vote card:** "should arnav take the 30% hike offer or stay put given the team seems toxic" → dig deeper before deciding · take it and bail if needed · check if money is worth the vibe

### candidate 1: take A, first-batch effort low

*hike-minus-therapy math, Distracted-boyfriend sticker*. 4 friends, 7 msgs, sticker by Farhan, ends on a question: yes.

> **Noor:** 30% hike minus therapy, swiggy stress orders and the cab you'll take to cry, that's maybe 12% real
> **Farhan:** every team is toxic, this one just pays 30% more for it  
> 🖼️ *sticker `distracted-boyfriend` — caption: "30% hike / you / your mental peace"*
> **Suresh:** took a toxic team for a 30% hike once, quit in 5 months, notice period ate the whole hike 💀
> **Shekhar:** toxic how, one rude interviewer or glassdoor horror stories
> **Suresh:** shekhar glassdoor is the tip, mine looked fine in the interview too, toxic shows up week 3
> **Shekhar:** suresh one bad team is a sample size of one, that's not evidence that's a vibe
> **Noor:** lol shekhar's glassdoor point is fair, but what's the actual 30% in rupees, and what exactly made the team seem toxic?

**Vote card:** "do you take the 30% hike or pass on the toxic team?" → Take it, money beats vibes · Pass, mental peace > rupees · Get real details first · Hard pass, it won't be worth it

### candidate 2: take A, first-batch effort medium

*hike-minus-therapy math, Distracted-boyfriend sticker*. 4 friends, 7 msgs, sticker by Farhan, ends on a question: yes.

> **Noor:** 30% hike minus therapy, swiggy stress orders and the cab to cry in, you're probably breaking even lol
> **Farhan:** every team is toxic, this one just pays 30% more for it  
> 🖼️ *sticker `distracted-boyfriend` — caption: "30% hike / you / your mental peace"*
> **Suresh:** took a toxic team for a 30% hike once. quit in 5 months and the whole hike went on the notice period lol
> **Shekhar:** toxic from one rude interviewer or actual glassdoor horror stories 💀
> **Farhan:** shekhar's glassdoor idea is overrated, those reviews are written by people who got fired. take the 30% and treat the toxicity like a rent.
> **Shekhar:** rent you can't move out of 💀
> **Noor:** lol rent you can't move out of is brutal, but what did the team actually do that felt toxic?

**Vote card:** "do you take the 30% hike even though the team feels toxic?" → take it, treat toxicity like rent · pass, mental peace > 30% · dig deeper first

### candidate 3: take B, first-batch effort low

*This-is-fine sticker for the toxic standup*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Farhan:** take it. 30% hike is a paid internship in tolerating people
> **Arjun:** take it if the manager's fine, bad manager is the dealbreaker
> **Lalitha:** 30% hike can wait a day, get a call with someone on that team first
> **Noor:** 30% of what though, 6L and 20L are very different pain  
> 🖼️ *sticker `this-is-fine` — caption: "toxic team standup / me with a 30% hike"*
> **Farhan:** calling a call first is just homework for a job you'll take anyway
> **Noor:** hard disagree, a 20 min call costs nothing and the hike is a fixed number. you're only risking a year of misery to save 20 minutes lol
> **Arjun:** lmao the standup sticker is accurate. so is the toxic part just the manager or the whole team?

**Vote card:** "do you take the 30% hike or dig deeper into the team situation first?" → Just take the hike · Call someone on the team first · Check if the manager's actually the problem

### candidate 4: take B, first-batch effort medium

*This-is-fine sticker for the toxic standup*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Farhan:** take it. everyone will say "toxic team, run" and that's exactly the lazy take. 30% hike is a 1 year paid internship in tolerating annoying people, and that skill pays forever. you're basically getting a salary to level up your patience, plus you can still leave after a year with a fatter number on your resume
> **Arjun:** take it if the manager's fine, bad team is survivable, bad manager isn't
> **Lalitha:** 30% is nice but don't sign till you get a call with someone on that team. ask them straight how the last few months went
> **Noor:** 30% of what base though, 30% on 6L and 30% on 20L are very different therapy budgets  
> 🖼️ *sticker `this-is-fine` — caption: "toxic team standup / me with a 30% hike"*
> **Farhan:** calling a team to ask is just HR theatre, they'll say it's great
> **Lalitha:** noor's right, get the base number first, then decide if it covers therapy lol
> **Arjun:** noor's sticker is accurate lol, so is the toxic part the manager or just the team?

**Vote card:** "do you take the 30% hike offer despite the toxic team?" → Take it, treat toxicity as skill-building · Take it only if the manager's solid · Get the base salary first, then decide

### candidate 5: take C, first-batch effort low

*Hera Pheri 'paisa hi paisa' GIF vs Suresh warning*. 4 friends, 7 msgs, sticker by Farhan, ends on a question: yes.

> **Farhan:** toxic teams are everywhere, 30% is rare. take the money and survive them like a pro  
> 🖼️ *gif `paisa-hi-paisa` (GIF, no caption; the text above carries it)*
> **Suresh:** took 30% once for a toxic team. spent half of it on therapy and swiggy 💀
> **Shekhar:** toxic from one interview is just vibes, 30% is real money
> **Pradeep:** negotiate a joining bonus first, covers your exit if it sucks
> **Farhan:** still 15% up. the toxic team funded your healing
> **Shekhar:** joining bonus comes with a clawback clause, bro. leave before a year and you're paying it back. read the offer letter before you celebrate
> **Suresh:** lmao clawback clause is brutal. what's the current job like, honestly?

**Vote card:** "do you take the 30% hike despite the toxic team vibes?" → Take it, toxic teams are everywhere · Negotiate a joining bonus first · Pass and stay in your current job

### candidate 6: take C, first-batch effort medium

*Hera Pheri 'paisa hi paisa' GIF vs Suresh warning*. 4 friends, 8 msgs, sticker by Farhan, ends on a question: yes.

> **Farhan:** take the 30%. every team is toxic somewhere, at least this one pays for your therapy and swiggy  
> 🖼️ *gif `paisa-hi-paisa` (GIF, no caption; the text above carries it)*
> **Suresh:** took 40% hike once. toxic boss made me cry in a Marriott bathroom by month 3 💀
> **Shekhar:** "toxic" after one interview is just vibes, 30% hike is a number, you haven't met that team yet
> **Pradeep:** take the 30% but ask for a joining bonus too, that's your exit fund if it's toxic
> **Farhan:** suresh crying in a marriott bathroom is just expensive therapy 💀
> **Shekhar:** joining bonus usually has a clawback if you quit within a year, some exit fund
> **Suresh:** most expensive therapy ever, ₹14k a night and the towels were the only thing that listened 💀
> **Pradeep:** how bad is the current job though, honestly?

**Vote card:** "do you take the 30% hike even though the team feels toxic?" → Take it, the money's worth it · Take it + negotiate a joining bonus · Think twice, current job might be safer


---

## 6. "Friends want a Bali trip. I have 40k in savings"

### old round 1 (2 friends, 4 msgs)

> **Pradeep:** 40k is enough, book flights tonight
> **Suresh:** went on a trip i couldn't afford once, came back to a credit card bill that ruined 4 months. bali on 40k is tight, set a hard budget first
> **Pradeep:** fair, so set the cap tonight. 30k, rest is buffer
> **Suresh:** wait how many days are they planning, and is anyone else covering the stay?

**Vote card:** "Should Arnav book the Bali trip now with his 40k savings, or figure out the details first?" → Book flights tonight, sort it out · Set a hard budget cap first · Get all the trip details sorted first

### old round 2 (3 friends, 6 msgs)

> **Suresh:** when i did a trip like this i spent my whole savings and ate maggi for 2 months after. set a budget first, bali is cheap if you skip the clubs
> **Noor:** flights alone eat half of that. what's the budget?
> **Lalitha:** set a hard number first, then we pick dates. 40k can work if you stay lean
> **Suresh:** noor's right, book flights early or it's gone
> **Noor:** lowkey the real cost is daily spend, ₹3k a day times 5 days is 15k gone
> **Lalitha:** valid, so cap daily spend at ₹2k

**Vote card:** "how should arnav budget and plan the bali trip with 40k savings" → set a hard budget cap now · go lean and keep daily spend low

### candidate 1: take A, first-batch effort low

*flight math kills it, Gokarna counter-offer, Drake sticker*. 4 friends, 7 msgs, sticker by Pradeep, ends on a question: yes.

> **Noor:** flights alone eat like 25k round trip, so you land in bali with 15k for the whole week. that's ₹2k a day, nasi goreng and vibes only
> **Suresh:** goa taught me 40k disappears in 3 days, then the credit card bill haunts you till march
> **Pradeep:** gokarna or pondy with the same gang, 12k all in. same beach energy, and your savings survive the trip  
> 🖼️ *sticker `drake` — caption: "bali on all 40k savings / gokarna with 25k left over"*
> **Lalitha:** if bali's happening, cap it at 35k, keep 5k untouched, and cut the villa and scooter rentals
> **Suresh:** pradeep finally says something smart. when i was in pondy i spent 3k on one dinner and still had change for the ferry lol
> **Pradeep:** lalitha's cap is fine but 35k still means no savings buffer for a bad month in bangalore. book gokarna this weekend, bali can wait till there's 80k
> **Noor:** lol the 5k buffer crowd is optimistic, has anyone in the gang actually booked flights yet?

**Vote card:** "do you go to bali on 40k or pick a cheaper trip closer to home?" → Bali now, cap spending at 35k · Gokarna this weekend instead · Wait till you have 80k for bali

### candidate 2: take A, first-batch effort medium

*flight math kills it, Gokarna counter-offer, Drake sticker*. 4 friends, 8 msgs, sticker by Pradeep, ends on a question: yes.

> **Noor:** flights alone eat 25k, so you're left with ₹1k a day in bali 💀
> **Suresh:** 40k for bali is the trip budget, not the savings budget. goa nearly killed me and the credit card bill after was worse. don't ask about goa
> **Pradeep:** gokarna or pondy, same gang, 12k all in  
> 🖼️ *sticker `drake` — caption: "bali on all 40k savings / gokarna with 25k left over"*
> **Lalitha:** if bali happens, cap it at 25k, cut the villa
> **Pradeep:** lalitha's cap is fine but nobody's booking anything till someone sets a deadline. friday, group votes
> **Suresh:** friday vote is fine but i once "decided later" on a trip and ended up paying for everyone's flights lol
> **Lalitha:** fine friday works, and whoever skips the vote doesn't get to complain about the plan
> **Noor:** lol friday vote it is, but has anyone in the gang actually paid for a flight yet?

**Vote card:** "do you go to bali on your full ₹40k or pick a cheaper trip like gokarna?" → bali with a ₹25k spending cap · gokarna or pondy instead · wait till friday vote before deciding

### candidate 3: take B, first-batch effort low

*panik-kalm-panik budget arc*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Lalitha:** 40k is enough for bali, just set a cap before anyone books flights
> **Noor:** flights alone eat 80% of that. rest is 8k for a week 💀  
> 🖼️ *sticker `panik-kalm-panik` — caption: "friends planning bali / you have 40k / flights are 32k"*
> **Suresh:** go but keep 20k untouched. i blew my whole savings on a trip once, rent was due the day i landed
> **Arjun:** go only if the 40k gets topped up before you fly. if it's still 40k on departure day, you're eating maggi in ubud 💀
> **Lalitha:** suresh's rent story is the real budget line, lock 20k now
> **Suresh:** maggi in ubud is still better than my goa dinner 💀
> **Noor:** when's the trip and how much can you add by then?

**Vote card:** "do you go to bali with 40k or wait to save more?" → go now, keep 20k locked · go only if you add more first · figure out the timeline first

### candidate 4: take B, first-batch effort medium

*panik-kalm-panik budget arc*. 4 friends, 7 msgs, sticker by Noor, ends on a question: yes.

> **Lalitha:** okay 40k is the cap, not the budget. flights alone will eat 15-20k, so lock dates first or everyone's picking different weeks
> **Noor:** nah the flight alone eats 80% of your savings and that's before a single nasi goreng. add visa on arrival, a villa split, scooter rental and the "just one beach club bro" tax and you're easily at 70k. 40k doesn't go to bali, 40k goes to bali's airport and watches everyone else leave 💀  
> 🖼️ *sticker `panik-kalm-panik` — caption: "friends planning bali / you have 40k / flights are 32k"*
> **Suresh:** went to a trip with zero buffer once, came back to a rent due and ₹800 in the bank 💀
> **Arjun:** go only if the 40k hits like 60k before the trip. if it doesn't, bali waits. set a date and auto-transfer salary day, strategically speaking
> **Suresh:** arjun's plan is solid, auto-transfer saved me once
> **Lalitha:** suresh living the ₹800 and maggi era is the real bali horror story 💀
> **Noor:** arjun's 60k target works, but when's the trip and how much can you add by then?

**Vote card:** "do you go to bali now with 40k, or wait and save up to 60k first?" → wait and save to 60k · go now with 40k · don't go, 40k isn't enough

### candidate 5: take C, first-batch effort low

*'Bilkul risk nahi lene ka' GIF, cautious crew*. 3 friends, 7 msgs, sticker by Suresh, ends on a question: yes.

> **Suresh:** when i was 26 i spent my whole 40k on a trip and ate maggi for a month  
> 🖼️ *gif `risk-nahi` (GIF, no caption; the text above carries it)*
> **Pradeep:** go, but 10k stays untouched. 30k is the budget
> **Noor:** 40k for bali is like ₹4k a day if you stay 10 days, flights eat half of that
> **Pradeep:** flights eat 15k, so book those tonight and cap the rest
> **Noor:** pradeep's math is fine but nobody's counting the stuff that isn't flights. after 15k and 10k untouched you're at 15k for 10 days, that's ₹1.5k a day for food, scooter, and every "just one beach club bro" moment. bali is cheap until your friends find a sunset dinner with a 3k minimum spend 💀
> **Suresh:** beach club minimum spend ate my goa budget once 💀
> **Pradeep:** noor's beach club math is scary but fair 💀 still, is the 40k all your savings or just fun money?

**Vote card:** "do you go to Bali with 40k or hold back and save more?" → Go for it, live a little · Go but keep 10k untouched · Skip it or save longer

### candidate 6: take C, first-batch effort medium

*'Bilkul risk nahi lene ka' GIF, cautious crew*. 3 friends, 7 msgs, sticker by Suresh, ends on a question: yes.

> **Suresh:** emptied my savings for a trip once, came back to 212 rupees and maggi for a month  
> 🖼️ *gif `risk-nahi` (GIF, no caption; the text above carries it)*
> **Pradeep:** go, but 10k stays untouched. 30k budget, done
> **Noor:** flights alone will eat 20k of that. split what's left across 5 days and it's like ₹4k a day, so no scooter flexing
> **Suresh:** forex fees and airport cabs ate 4k of mine, so 30k is really 26k
> **Pradeep:** book the flights tonight, prices only go up
> **Noor:** bali visa on arrival is extra, budget that too
> **Suresh:** is 40k all your savings or just fun money?

**Vote card:** "do you go to Bali with 40k or pump the brakes?" → Go ahead, book flights tonight · Go but keep 10k safe, spend 30k max · Pump the brakes, ask yourself first


---

## 7. "She left me on seen for 2 days. Do I double text?"

### old round 1 (2 friends, 4 msgs)

> **Priya:** did this last month and regretted it so bad lol
> **Tanmay:** two days of silence is an answer, you're just proofreading it
> **Priya:** tanmay's right about the proofreading thing but i'd add, you already know what you want to send, that's the problem. i literally drafted a "no worries if you're busy!!" text for like an hour and the "!!" alone screamed desperate lol. what did she last say to you before the silence?
> **Tanmay:** wait was it a good convo or did it die on its own

**Vote card:** "Should Arnav send a follow-up text after being left on seen for 2 days?" → Don't double text, let it go · Find out what happened first · Send a chill follow-up text

### old round 2 (3 friends, 6 msgs)

> **Meera:** NO DO NOT DOUBLE TEXT. she can see your message and she's ignoring it, that's on her
> **Priya:** did this last month and regretted it so hard lol
> **Divya:** the real question isn't double text or not, it's why 2 days of silence feels like a verdict
> **Meera:** PRIYA WHY DIDN'T YOU TELL US EARLIER, WHO DID YOU DOUBLE TEXT, THEY DON'T DESERVE YOU
> **Divya:** wait arnav, did she go quiet after something specific?
> **Priya:** meera chill it was just a random guy lol, long story

**Vote card:** "Should Arnav send another text or wait for her to respond?" → Don't double text, let it go · Wait but figure out what happened first · Send the second text anyway

### candidate 1: take A, first-batch effort low

*Tanmay spiral vs Sneha flat no, panik-kalm-panik sticker*. 3 friends, 7 msgs, sticker by Meera, ends on a question: yes.

> **Sneha:** 2 days is an answer, you're just proofreading it
> **Meera:** TWO DAYS?? double text and make it a meme, send her a picture of a sad dog with a Swiggy bag  
> 🖼️ *sticker `panik-kalm-panik` — caption: "left on seen / she's probably busy / she posted a story 3 hours ago"*
> **Priya:** 2 days on seen is nothing, i once waited 4 for a girl in andheri and she replied "lol" 💀
> **Sneha:** she posted a story, she has her phone. that's your answer
> **Meera:** FOUR DAYS FOR A "LOL"?? PRIYA WHY ARE YOU DEFENDING THAT, SHE OWED YOU A NOVEL
> **Priya:** meera i was defending myself, that girl owed me nothing and i still checked my phone at every red light
> **Sneha:** what was your last message to her, a paragraph?

**Vote card:** "do you double text her or leave it?" → double text, make it funny · don't double text, she's ghosting · it's nothing, keep it chill

### candidate 2: take A, first-batch effort medium

*Tanmay spiral vs Sneha flat no, panik-kalm-panik sticker*. 3 friends, 7 msgs, sticker by Dev, ends on a question: yes.

> **Dev:** she's busy, just not with you. 2 days of story views tho  
> 🖼️ *sticker `panik-kalm-panik` — caption: "left on seen / she's probably busy / she posted a story 3 hours ago"*
> **Priya:** 2 days isn't even ghosting yet, it's just her phone being buried under 400 unread group messages
> **Noor:** 2 days is 48 hours of data and double texting adds another unanswered entry lol
> **Priya:** double texting after 2 days is fine, i once sent "hello??" to a guy named Karan after 4 days and we're still friends
> **Dev:** karan is a saint, you got lucky with that one
> **Noor:** karan's friendship has a 100% survival rate, n=1 💀
> **Dev:** lmao noor with the stats. what was your last text to her?

**Vote card:** "do you double text her or wait it out?" → Just send another text · Don't double text, hold back · Leave it alone for now

### candidate 3: take B, first-batch effort low

*Hide-the-pain sticker for 'no worries if you're busy!'*. 3 friends, 7 msgs, sticker by Meera, ends on a question: yes.

> **Meera:** TWO DAYS?? she posted 14 stories in that time, i'm sorry but no double text  
> 🖼️ *sticker `hide-the-pain` — caption: "'no worries if you're busy!!' / day 3 on seen"*
> **Priya:** nah don't, my cousin waited 3 days and got a reel of a guy hugging a goat
> **Tanmay:** two days is a long time to refresh a chat
> **Meera:** WHAT. she's seen your message and chose chai-break energy over replying, that's disrespect
> **Priya:** fourteen stories but no time for one text is actually insane, i'd mute her and go eat something
> **Tanmay:** the sticker says "no worries if you're busy" but you're the one who's been busy refreshing
> **Meera:** WAIT what did you actually send her, was it a question or a statement?

**Vote card:** "do you double text her or just move on?" → don't double text, let it go · chill out and stop refreshing

### candidate 4: take B, first-batch effort medium

*Hide-the-pain sticker for 'no worries if you're busy!'*. 3 friends, 7 msgs, sticker by Meera, ends on a question: yes.

> **Meera:** TWO DAYS?? she posted 4 stories in that time, she's not busy she's just rude  
> 🖼️ *sticker `hide-the-pain` — caption: "'no worries if you're busy!!' / day 3 on seen"*
> **Priya:** 2 days is nothing, mine took 3 and sent a reel
> **Suresh:** double texting after 2 days seen is how i lost a whole relationship lol
> **Priya:** that sticker with the two exclamation marks is basically a threat lmao. send it and she'll reply in 4 minutes purely out of spite, day 3 energy is unmatched
> **Meera:** lmao suresh lost a whole relationship over a text, that's not the text's fault
> **Suresh:** meera it was the text AND the 3am timing lol
> **Meera:** WHY IS SHE ON SEEN, was your last text a question or a statement?

**Vote card:** "do you double text her or wait it out?" → double text her now · don't double text, just wait · figure out what your last text was

### candidate 5: take C, first-batch effort low

*Baburao 'utha le' GIF, fed-up energy*. 3 friends, 7 msgs, sticker by Dev, ends on a question: yes.

> **Dev:** two days is not seen, that's a eviction notice  
> 🖼️ *gif `utha-le` (GIF, no caption; the text above carries it)*
> **Pradeep:** one light text today, then drop it forever
> **Priya:** 2 days isn't even a tragedy, she's probably just ignoring you 💀
> **Pradeep:** priya's right, 2 days is nothing, she's probably just busy lol
> **Priya:** pradeep he's already got the double text drafted in his notes app 💀
> **Dev:** pradeep's note draft is longer than my last appraisal review
> **Pradeep:** lol dev roasting the notes app draft. how long were you two talking before she vanished?

**Vote card:** "do you double text her or let it go?" → send one light text today · don't text, just drop it

### candidate 6: take C, first-batch effort medium

*Baburao 'utha le' GIF, fed-up energy*. 3 friends, 6 msgs, sticker by Dev, ends on a question: no.

> **Dev:** two days is a verdict, not a delay  
> 🖼️ *gif `utha-le` (GIF, no caption; the text above carries it)*
> **Sneha:** no don't double text. two days of seen is her answer, you're just hoping it expires
> **Lalitha:** nah no double text yet, two days is just one problem with a deadline, give it till day 4
> **Dev:** she's active on insta stories though, just not on you 💀
> **Sneha:** day 4 just means two more days of checking your phone
> **Lalitha:** hold on, she's watching stories but not replying? that changes my deadline

**Vote card:** "do you double text or wait it out?" → don't text, she's given her answer · wait till day 4, then decide · she's active but ignoring you, move on


---

## 8. "Parents want me home by 10pm. I'm 24"

### old round 1 (3 friends, 6 msgs)

> **Farhan:** everyone will say move out. 10pm is honestly generous, my curfew is whenever mom's biryani is ready
> **Suresh:** lived at home till 29, curfew till 27. moving out was the best decision i delayed
> **Pradeep:** have you told them it's too early? yes or no. if not, tell them tonight, ask for 12am
> **Farhan:** asking for 12am is just negotiating your own leash
> **Pradeep:** leash or not, 12am beats 10pm. just ask
> **Suresh:** asked for 12am once, got 11. took me 3 years

**Vote card:** "Should Arnav negotiate his 10pm curfew with his parents?" → Ask for 12am tonight · Accept it and move out soon · Let it be, curfews are part of home

### old round 2 (3 friends, 6 msgs)

> **Dev:** cinderella had a better deal at 12
> **Suresh:** lived with my parents till 29, the curfew ends when you pay rent somewhere else lol
> **Meera:** 10PM AT 24?? THAT IS NOT OKAY, YOU'RE AN ADULT WITH A JOB
> **Dev:** rent in bangalore is just a ₹30k curfew
> **Meera:** WAIT why 10?? did something happen or is it just their rule
> **Suresh:** wait is this a strict rule or did something happen to make them set it

**Vote card:** "Should Arnav push back on his parents' 10pm curfew or just accept it?" → Push back, you're an adult · Move out and set your own rules · Find out why they set it

### candidate 1: take A, first-batch effort low

*Cinderella deadpan + 'always has been' sticker*. 4 friends, 8 msgs, sticker by Suresh, ends on a question: yes.

> **Dev:** even cinderella got till midnight and she had a pumpkin to deal with, you're 24 with a curfew lol
> **Meera:** TEN PM?? YOU PAY YOUR OWN PHONE BILL AND THEY'RE RUNNING YOU LIKE CINDERELLA
> **Suresh:** lived at home till 29, my curfew vanished the day i paid rent  
> 🖼️ *sticker `always-has-been` — caption: "wait, the curfew lasts till marriage? / always has been"*
> **Pradeep:** negotiate 11:30 tonight, send live location, parents love that
> **Meera:** 29?? SUресh YOU SURVIVED FIVE EXTRA YEARS OF THAT, I WOULD HAVE LOST IT
> **Dev:** suresh basically did a five year bonus level nobody asked for 💀
> **Suresh:** survived is a strong word, i just got really good at sneaking in 💀
> **Pradeep:** so what happens if you roll in at 10:30?

**Vote card:** "what do you do about the 10pm curfew tonight?" → negotiate for a later time · just ignore it and come home late · get sneaky with it

### candidate 2: take A, first-batch effort medium

*Cinderella deadpan + 'always has been' sticker*. 4 friends, 6 msgs, sticker by Suresh, ends on a question: no.

> **Dev:** cinderella got till midnight and she's not even 24
> **Meera:** 10PM?? YOU PAY TAXES, YOU HAVE A SALARY, YOU CAN LEGALLY VOTE. CINDERELLA HAD A LATER CURFEW THAN THIS.
> **Suresh:** lived at home till 29. curfew vanished the day i started paying rent, magically 10pm became "just text when you're back"  
> 🖼️ *sticker `always-has-been` — caption: "wait, the curfew lasts till marriage? / always has been"*
> **Lalitha:** the 10pm isn't the real problem, they're scared something happens to you out there. fix that and the curfew moves.
> **Dev:** his curfew is earlier than my swiggy delivery window
> **Meera:** TILL MARRIAGE?? THEN HE'S BEING HELD HOSTAGE FOR 5 MORE YEARS

**Vote card:** "how do you handle the 10pm curfew your parents set?" → Start paying rent, negotiate freedom · Address their real fear, not the time · Push back—you're an adult

### candidate 3: take B, first-batch effort low

*live-location loophole, Roll-safe sticker*. 3 friends, 7 msgs, sticker by Pradeep, ends on a question: yes.

> **Pradeep:** live location on, home by 11:30. deal  
> 🖼️ *sticker `roll-safe` — caption: "can't break curfew / if you're home by 10 and leave again at 10:30"*
> **Tanmay:** the 10pm isn't the problem, they just haven't clocked that you're 24 yet
> **Meera:** TEN PM?? you're 24, cinderella got a better curfew than you. tell them 1am or you stop paying rent
> **Pradeep:** nah meera's 1am plan gets him a 6am wake up call and a lecture. stop paying rent is cap too, he'd be homeless by thursday. just tell them tonight you're 24 and you're coming home at 12 on weekends. one sentence, done.
> **Meera:** PRADEEP 12 ON WEEKENDS IS STILL A CURFEW, HE'S 24 NOT A SCHOOL BUS
> **Tanmay:** meera negotiating 1am is wild when the real fight is whether they'd even notice he's gone
> **Pradeep:** meera caps lock is loud but fair, anyway do you pay anything at home or is it free rent?

**Vote card:** "how do you push back on your parents' 10pm curfew?" → have a quick, direct conversation · demand a later time or stop paying rent · just leave and see if they notice

### candidate 4: take B, first-batch effort medium

*live-location loophole, Roll-safe sticker*. 4 friends, 6 msgs, sticker by Pradeep, ends on a question: no.

> **Pradeep:** live location on, home by 11:30. deal  
> 🖼️ *sticker `roll-safe` — caption: "can't break curfew / if you're home by 10 and leave again at 10:30"*
> **Dev:** curfew at 24 is wild, cinderella had better terms
> **Tanmay:** the 10pm isn't the problem, they just haven't clocked that you're 24 yet
> **Meera:** WHAT. 10pm at 24?? if you're not paying rent, demand a 1am curfew at least
> **Dev:** at 24 you're paying rent in their house with your freedom, and 10pm is the late fee
> **Meera:** 10pm?? the night hasn't even started, it's still loading

**Vote card:** "do you push back on the 10pm curfew or just work around it?" → Push back, demand a later curfew · Sneak out after 10:30 · Just accept it for now · Move out

### candidate 5: take C, first-batch effort low

*'Rasode mein kaun tha' GIF: the 10:15 gate*. 4 friends, 7 msgs, sticker by Dev, ends on a question: yes.

> **Meera:** 10PM?? YOU'RE 24, CINDERELLA HAS A LATER CURFEW
> **Suresh:** lmao 10pm at 24 is brutal. when i was 24 i lied about a "friend's birthday" three weekends in a row, mom called the friend's mom. never lying again, just negotiate 11:30 and take the win
> **Dev:** curfew at 24 is just a free hostel with dal  
> 🖼️ *gif `rasode` (GIF, no caption; the text above carries it)*
> **Lalitha:** most of the stress is probably the 10pm part, not the actual curfew. one thing at a time lol
> **Dev:** cinderella at least got a pumpkin ride home
> **Meera:** NO LALITHA THE 10PM IS THE WHOLE PROBLEM, A GROWN ADULT CAN'T BE HOME BEFORE DINNER DIGESTS
> **Suresh:** lmao pumpkin ride is a fair point, but does your sibling get the same 10pm rule or is that just you?

**Vote card:** "do you push back on the 10pm curfew or negotiate a later time?" → Push back hard on the rule itself · Negotiate for 11:30pm instead · Accept it as the trade-off for free rent · Focus on one thing at a time

### candidate 6: take C, first-batch effort medium

*'Rasode mein kaun tha' GIF: the 10:15 gate*. 3 friends, 6 msgs, sticker by Dev, ends on a question: no.

> **Dev:** you opening the gate at 9:58 like a hostage  
> 🖼️ *gif `rasode` (GIF, no caption; the text above carries it)*
> **Lalitha:** 10pm at 24 is wild, that's like cinderella with a mom calling every 15 mins. honestly the 10pm part is fixable, just negotiate 11:30 first
> **Priya:** 10pm at 24 is cinderella rules, no glass slipper though
> **Dev:** negotiating 11:30 with parents is a ₹0 budget hostage deal
> **Priya:** my mom texted "reached?" at 9:41 once, i was at the door
> **Lalitha:** priya standing at the door with "reached?" pinging is peak, 9:41 and she's already on the clock

**Vote card:** "do you negotiate a later curfew with your parents or just accept the 10pm rule?" → negotiate for 11:30, work your way up · just accept it and move on · call out how old you are


---

## typed first messages (no chip plan)

These use the generic first-round rules. No sticker shows for guests today (`allowMedia` is off for them); signed-in users get one sticker offer on the first round.

### "The girl I like posted the photos of the lilies I gave her, but only on close friends" (4 friends, 7 msgs)

> **Dev:** close friends is just the group project of instagram, you got a seat
> **Meera:** CLOSE FRIENDS?? you gave her LILIES and she hides them like evidence, that's NOT okay
> **Dev:** meera it's not evidence, it's a soft launch. lilies are on probation, he's in the trial period
> **Suresh:** bro she posted them, that's already a win
> **Meera:** PROBATION?? DEV he gave her LILIES, not a resume, she can post them on the main feed
> **Tanmay:** she photographed the lilies, not you. flowers got the close friends slot
> **Suresh:** when i was her age i posted a girl's gift on close friends too, it was 9 people. how many people are on her list?

**Vote card:** none

### "bored of my job tbh" (2 friends, 2 msgs)

> **Priya:** ooh "bored" is doing a lot of work here lol. what's the actual drama, boss texting on Sunday?
> **Meera:** Bored?? THEY BETTER NOT BE UNDERVALUING YOU. spill everything right now

**Vote card:** none

### "should i buy the iphone 17 on EMI" (3 friends, 7 msgs)

> **Lalitha:** budget has to fit the phone, not the other way round, and 24 months of emi for a 17 is wild
> **Pradeep:** nah if you can't pay for it upfront you can't afford it, simple. emi on a phone that loses half its value in 2 years is just paying interest for a shiny rectangle. my protein bowl budget alone is more disciplined than that 💀 keep the old phone till it dies
> **Suresh:** emi on a phone, been there lol
> **Pradeep:** suresh you're still paying it off lmao, ask him how it went
> **Suresh:** lmao 14 months in, still paying for a phone that's already slow
> **Lalitha:** suresh still paying for a phone that's already got a cracked screen, that's the real 24 month plan 💀
> **Pradeep:** lmao suresh's phone is a hostage situation. what's your current phone?

**Vote card:** "do you buy the iPhone 17 on EMI?" → Skip it, keep your old phone · Only if you can pay upfront · Go for it, learn the hard way
