<div align="center">
<img width="3800" height="1808" alt="image" src="https://github.com/user-attachments/assets/85896b80-29bb-4a50-a535-18f6e97b5fa5" />


</div>

A very light-weight modern IPTV-app for WebOS, optimized for LG C5(WebOS 25).

*Focused on football streaming with highlighted games taken from football-data.org. Interactive list with EPG search to find the right channel streaming it. 

Goal Alert System:
Pings football-data.org once a minute for change in scoreline with an alert for a goal scored. Works for rescinding goals as well.

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1BNSgy5ccUO9vNbn0OIy0y1CRefbOLHkA

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Setup the necessary URL for EPG and playlist URL and API for bringing highlighted games from football-data.org in [.env.local](.env.local)
3. Run the app:
   `npm run dev`
