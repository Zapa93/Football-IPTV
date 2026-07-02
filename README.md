A WebOS app customized for the football experience.

## Features:

**Live score**

Sidebar with minute by minute live score of Europe's biggest leagues and team, customizable through geminiService.tsx with a priority system to place the followed or big leagues up front.

**Match channel lookup**

Look-up system with EPG search to find the channel showing the game with a click.

**Teletext**

Teletext added for Swedish SVT, both in fullscreen and side-by-side mode. 

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the API-keys to different functions in [.env.local](.env.local)
3. Run the app:
   `npm run dev`

## Build App


`ares-package dist´ to build the app .ipk file then proceed to install through [WebOS Dev Manager.](https://github.com/webosbrew/dev-manager-desktop)
