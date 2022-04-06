---
layout: post
title:  "Abusing text command processing"
date:   2022-04-06 02:26:26 -0400
categories: "ntdf"
tags: "re"
---
A glitch that can be found in some video games is that you can walk around with a textbox open. However, in [Neopets: The Darkest Faerie][ntdf] for the PS2, this kind of glitch can be abused to do some pretty interesting things. One of the features of this game is that dialogue text can have commands included in it. These commands can set story flags and give items, among other things. Of course, bugginess in the way textboxes are handled is already abused to [farm infinite money during speedruns][infinite-money]. 

To explain why walking around with a textbox open is interesting, it is important to understand that this game uses a pretty innovative seamless loading system. This allows walking from one end of the world to the other without seeing any loading screens[^load_screens]. This means that if you open a text box, and then walk away with the textbox open until the area that caused the text box to unload, the game will instead display whatever garbage data happens to be at the location in memory where the dialogue data was stored, as text. If you play your cards right, that garbage data could be a useful text command. 

<figure>
  <img src="/images/gordos-text-replacement.jpg"/>
  <figcaption>Garbage data being displayed as text</figcaption>
</figure>

Unfortunately, there are two problems with this. The first is that badly formatted text can easily crash the game. The text is copied to a 512-byte buffer[^buffer], so if the text is too big, other data could be overwritten. In addition, the processing code for the text commands is pretty buggy and can overwrite important data on the stack sometimes- more on that later. However, the biggest problem is that, especially when arguments are in the mix, text commands can be quite long and complicated, which doesn't bode well for garbage data happening to be a useful one.

Before we move on, let's take a short look at the format for text commands. Idol Minds designed the format with the goal of not having any zero bytes (because that marks the end of a string), and not having any `0x01` bytes after the very first one (because that marks the beginning of a text command). A text command begins with a 5 byte header. Here's a breakdown of the command that gives the player 500 neopoints:

```
01 - This denotes the start of a command
04 - This is the number of arguments +2 (to avoid 0s or 1s). In this case, there are 2 arguments
13 - The total number of bytes in the command
13 - What type of command this is - in this case, it gives the player an item
14 - Flags, +2. Once again, to avoid 0s or 1s

87 fd 40 fd 40 fd 40 - The argument 0x00000087, which in the context of this command, is the item type, Neopoints.
f4 fd 41 fd 40 fd 40 - The argument 0x000001f4, or 500 in decimal, which is the amount to give the player.
```

There is a pretty major bug, unfortunately, with the way that the argument count is handled. The game doesn't cap the number of arguments, which means that if there are more than 7 arguments, the text command parser will start overwriting important data, like the return address in the stack. Oops. If the data being fed to the text box can be controlled (for example, a hacked save file), this can be used to jump to an arbitrary address and execute arbitrary code. Unfortunately, we can't really do that in a speedrun context - all we have is whatever data happens to be put in the textbox buffer when a new area is loaded, and more often than not, a 1 byte will probably be followed by a value big enough to crash the game.

You may notice that the format of the arguments is a little strange. This is because any 0 or 1 bytes need to be escaped. This is done by using a `0xFD` byte, followed by the byte you want with `0x40` added to it. In order to represent the specific byte `0xFD`, the sequence `FD 02` is used. Finally, any other value below `0x40` following `0xFD` will be treated as a 0, with the game complaining in the console about it with an excessive amount of dashes and asterisks[^escape_error], which doesn't affect anything important.

There are a few commands that could help us.

- 0x13 or 0x14 gives us an item. It takes two arguments, a type and amount.
- 0x11 sets a flag, or a range of flags. It takes two arguments.
- 0x12 clears a flag, or a range of flags.
- 0x19 sets a "game stage". This is one of 8 different predefined sets of items and flags which are used by the debug new game menu to spawn in the player at a specific point in the game's storyline. For some reason, this is available as a text command. Accepts one argument, a value from 0-7.
- There is one more command that likely used to load into an area during development, but is sadly now a no-op in the published game.

<figure>
  <img src="/images/debug-new-game.jpg"/>
  <figcaption>The debug new game menu, which uses the game stage command internally</figcaption>
</figure>

So some potential useful things that could be done with this, that could potentially have a setup be found, include:

- Set game stages 1 and 2, which would put us into act 4. This would still require going to the castle, and "repeating" the end-act-3 sequence, which the game luckily is okay with us doing. Technically the debug new game menu also sets game stage 0 as well, but it's not strictly necessary to progress.
- Use the set-flag command to directly set some useful flags

In order to do useful things, it seems we need to run commands with arguments. Simply having 0 be the argument will be not very useful (Game stage 0 puts us into act 2, which softlocks the game because the game expects you to be in Faerieland, which running the command doesn't actually do, and flag 0 and item 0 aren't much more useful either). 

However, before we get too ahead of ourselves we need to actually be able to trigger one of these commands first. This will require some searching. For this, I wrote a simple tool that goes through all the text boxes, and checks every pair of textbox + area and sees what happens if the game swapped to that area with that textbox open. Unfortunately, I couldn't find any feasible setups to trigger any useful text commands. That doesn't mean there aren't any - there could be dynamic data I'm not considering, or dynamically loaded asset groups (which are hard to predict the loading address of at the moment). However, for now I will have to get more creative.

Remember, earlier, when I said that the text is copied to a 512-byte buffer? This actually comes in handy here. If a long piece of data gets copied into the buffer, followed by a shorter piece, the end of the longer piece of data sticks around. This fact is abused in the [infinite money glitch][infinite-money] that I mentioned at the beginning of this article. In the case of garbage data though, this can be used to put together a text macro out of smaller pieces. The easiest way to do this is with a piece of data that ends in `01 00`, which is a surprisingly common occurrence[^common]. This does mean that the second byte of the macro has to be 0, which means that it has -2 arguments, which the game treats as 0 arguments[^zero_args]. Luckily, I was able to find a doable setup that combines two text replacements to create a text macro that sets game stage 0. This does softlock the game, but is nonetheless pretty cool.

<video src="https://cdn.discordapp.com/attachments/590332063966691330/952848217354141706/2022-03-14_04-36-44.mp4" width=640 controls></video>

An example of triggering this from the start of the game can be found [here][full-run]

The way this works is to first trigger the textbox where Gordos tries to sell you a map to Bogshot Swamp. Then, you walk to Western Brightvale with the textbox open. The textbox then must be ended without pressing next as that would overwrite the data- this is doable simply by waiting, as the game will interrupt the textbox with another one if you haven't defeated the minions on the beach yet. Either way, after this, the "Wheee! What a fun wheel!" textbox from Ella must be triggered in Meridell (which has a 1/3rd chance of happening if you beat the wheel of chance beforehand), and then you walk with the textbox open to Illusen's glade.

The first text unload off of Gordos copies this data into the buffer:
```
  ... e1 05 9c e1 05 19 a0
```
The second text unload off of Ella copies:
```diff
  ... e1 05 9c e1 05 19 a0
+ ... 8b 3e 01 00
  ... 8b 3e 01 00 05 19 a0
```

The `01 00 05 19 a0` is interpreted as a text macro without arguments that sets the game stage. Since no arguments are specified, data leftover from the stack, which happens to be 0, is used as the argument.

I may look into this more in the future to see if I can find a setup that's more useful and doesn't softlock the game. This may involve finding a way to inject arguments into the macro, or using asset group data. However, the fact that anything cool can be done besides displaying garbled text and crashing the game is pretty neat, in my opinion.

[^load_screens]: The game will stop you and display a loading spinner if you go too fast... Usually. There are instances where the game doesn't and you can see the world be missing until it loads in. If you're fast enough, you can even briefly fall out of the world. Either way, the loading spinner doesn't close text boxes, so it doesn't matter.
[^buffer]: You might be thinking, "Wait, if the text is copied to a buffer, why should the text being unloaded change anything?" It turns out the game checks every frame whether the text in the buffer matches the text in the dialogue table, and if it has changed, updates it, and resets the text scroll.
[^escape_error]: The error message in question is `"*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-Error, unrecognized escape command %i *-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n"`
[^common]: The reason this happens a lot is that area data often contains a lot of pointers. Since exterior areas are mostly in the upper half of the PS2's 32MB ram, the last (most significant) byte is `01`. A zero value is pretty common after this. Unfortunately, most of these happen too close to the start of a potential text box, and the previous textbox would have overwritten any useful data. This can also happen a by chance, which is more likely to yield a 1 byte deeper into the buffer.
[^zero_args]: This doesn't mean that there will always be no arguments though, it just means the macro won't set them, and whatever happens to be leftover on the stack will be used as the arguments instead - I will have to look into this more though. It seems for now that the arguments are 0 when this happens. I'll have to take a closer look and see exactly where the zero comes from, and see if it can be manipulated. A previous macro with arguments would probably do the trick, but it would be quite hard to find something like this.

[ntdf]: https://en.wikipedia.org/wiki/Neopets:_The_Darkest_Faerie
[infinite-money]: https://www.youtube.com/watch?v=dcK9MpwcMJI
[full-run]: https://www.twitch.tv/videos/1447581784
