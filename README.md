# Iron Front

Original browser-based team multiplayer FPS.  
Up to 16 players • 5 classes • Deployable LMG • Keyboard + Controller support

## Local development

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy to a free public URL (Render.com)

Render’s free tier supports WebSockets and is one of the easiest options.

### Steps

1. Create a free account at [https://render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub account (or upload the project as a zip / use the manual deploy option)
4. Configure the service:

   | Setting              | Value                          |
   |----------------------|--------------------------------|
   | Name                 | iron-front (or any name)       |
   | Runtime              | Node                           |
   | Build Command        | `npm install`                  |
   | Start Command        | `npm start`                    |
   | Instance Type        | Free                           |

5. Click **Create Web Service**
6. Wait 1–3 minutes for the first deploy
7. Your public link will look like:  
   `https://iron-front-xxxx.onrender.com`

### Notes about the free tier
- The service spins down after ~15 minutes of inactivity.
- First request after sleep can take 30–60 seconds to wake up.
- Perfect for testing with friends.

## Alternative free hosts

- **Railway.app** – Good free credits, very simple deploy from GitHub
- **Fly.io** – Free allowance, slightly more advanced CLI

## Controls

| Action              | Keyboard / Mouse     | Controller              |
|---------------------|----------------------|-------------------------|
| Move                | WASD                 | Left Stick              |
| Look                | Mouse                | Right Stick             |
| Shoot               | Left Click           | RT / R2                 |
| Jump                | Space                | A / Cross               |
| Special ability     | F                    | X / Square              |
| Mount / Dismount LMG| E                    | Y / Triangle            |

### Classes
- **Rifleman** – Balanced infantry rifle
- **Support** – LMG + Deployable stationary MG (F to deploy, E to mount)
- **Marksman** – High-damage scoped rifle
- **Engineer** – SMG + plantable explosive charges
- **Medic** – SMG + heal nearby teammates
