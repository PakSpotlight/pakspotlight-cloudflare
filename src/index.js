2026-09-13T01:47:05.123Z	Initializing build environment...
2026-09-13T01:47:07.687Z	Success: Finished initializing build environment
2026-09-13T01:47:08.338Z	Cloning repository...
2026-09-13T01:47:11.137Z	Detected the following tools from environment: npm@10.9.2, nodejs@24.18.0
2026-09-13T01:47:11.140Z	Installing project dependencies: npm clean-install --progress=false
2026-09-13T01:47:19.033Z	
2026-09-13T01:47:19.033Z	added 37 packages in 6s
2026-09-13T01:47:19.035Z	
2026-09-13T01:47:19.035Z	9 packages are looking for funding
2026-09-13T01:47:19.035Z	  run `npm fund` for details
2026-09-13T01:47:19.036Z	npm warn allow-scripts 2 packages have install scripts not yet covered by allowScripts:
2026-09-13T01:47:19.036Z	npm warn allow-scripts   esbuild@0.28.1 (postinstall: node install.js)
2026-09-13T01:47:19.036Z	npm warn allow-scripts   workerd@1.20260903.1 (postinstall: node install.js)
2026-09-13T01:47:19.037Z	npm warn allow-scripts
2026-09-13T01:47:19.037Z	npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
2026-09-13T01:47:19.290Z	Executing user deploy command: npx wrangler deploy
2026-09-13T01:47:21.994Z	
2026-09-13T01:47:21.994Z	 ⛅️ wrangler 4.129.0
2026-09-13T01:47:21.995Z	────────────────────
2026-09-13T01:47:22.085Z	
2026-09-13T01:47:22.085Z	Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md
2026-09-13T01:47:22.088Z	
2026-09-13T01:47:22.203Z	✘ [ERROR] Build failed with 1 error:
2026-09-13T01:47:22.204Z	
2026-09-13T01:47:22.205Z	  ✘ [ERROR] Unexpected end of file
2026-09-13T01:47:22.208Z	  
2026-09-13T01:47:22.208Z	      src/index.js:209:0:
2026-09-13T01:47:22.208Z	        209 │ 
2026-09-13T01:47:22.209Z	            ╵ ^
2026-09-13T01:47:22.209Z	  
2026-09-13T01:47:22.209Z	  
2026-09-13T01:47:22.209Z	
2026-09-13T01:47:22.209Z	
2026-09-13T01:47:22.310Z	🪵  Logs were written to "/opt/buildhome/.config/.wrangler/logs/wrangler-2026-09-13_01-47-21_431.log"
2026-09-13T01:47:22.454Z	Failed: error occurred while running deploy command
