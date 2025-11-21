import time
import os
from google import genai
from google.genai import types
from PIL import Image

# Setup Client
client = genai.Client(api_key="AIzaSyAt3gbC7OCgjdZdF-FqkyryZWEvE7mgvnw") # Using provided key

def create_gamebuddies_ad():
    print("🎬 Starting GameBuddies Ad Creation with Veo...")

    # Define paths to our normalized avatars
    avatars_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public/avatars'))
    premium_dir = os.path.join(avatars_dir, 'premium')
    free_dir = os.path.join(avatars_dir, 'free')

    # Select key avatars to feature (using absolute paths)
    # We'll use the normalized PNGs we just created
    avatar_files = [
        os.path.join(premium_dir, 'archer.png'),
        os.path.join(premium_dir, 'knight.png'),
        os.path.join(premium_dir, 'mage.png')
    ]

    # Verify files exist
    valid_avatars = []
    for p in avatar_files:
        if os.path.exists(p):
            valid_avatars.append(p)
        else:
            print(f"⚠️ Warning: Avatar not found at {p}")

    if not valid_avatars:
        print("❌ No avatars found to generate video.")
        return

    print(f"✅ Found {len(valid_avatars)} avatars for reference.")

    # Load images as PIL Images for the API
    reference_images = []
    import io
    for path in valid_avatars:
        print(f"   - Loading {os.path.basename(path)}")
        try:
            with open(path, "rb") as f:
                image_bytes = f.read()
            
            # Create GenAI Image type directly from bytes
            genai_image = types.Image(
                image_bytes=image_bytes,
                mime_type='image/png'
            )
            
            reference_images.append(types.VideoGenerationReferenceImage(
                image=genai_image,
                reference_type="asset"
            ))
        except Exception as e:
            print(f"   ❌ Failed to load image: {e}")

    # Prompt for the video
    # We want a showcase of these characters in a game-like setting
    prompt = (
        "A cinematic trailer for a multiplayer game called GameBuddies. "
        "Show the provided mascot characters (Archer, Knight, Mage, and Base) "
        "standing together in a vibrant, pixel-art inspired fantasy lobby. "
        "The camera pans slowly across them as they perform idle animations like "
        "waving, checking gear, or casting small magical sparks. "
        "The background is a cheerful, bright game world with floating islands. "
        "The video feels energetic and inviting, highlighting the variety of customizable characters."
    )

    print("\n🚀 Sending request to Veo 3.1...")
    try:
        operation = client.models.generate_videos(
            model="veo-3.1-generate-preview", # Use preview model for faster generation/lower cost
            prompt=prompt,
            config=types.GenerateVideosConfig(
                reference_images=reference_images,
                # aspect_ratio="16:9", # Removed to use default
                # fps=24 # Removed as not supported
            ),
        )

        print("⏳ Waiting for video generation...")
        while not operation.done:
            time.sleep(10)
            operation = client.operations.get(operation)
            print(".", end="", flush=True)
        
        print("\n✨ Generation complete!")

        if operation.result and operation.result.generated_videos:
            video = operation.result.generated_videos[0]
            output_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../public/gamebuddies_veo_ad.mp4'))
            
            print(f"💾 Saving video to: {output_path}")
            
            try:
                # Debug info
                print(f"   Video object: {video}")
                print(f"   Video.video object: {video.video}")
                print(f"   Video.video attributes: {dir(video.video)}")
                
                # Try to find the URI or ID
                # Usually it's .uri or .name or .response.uri
                
                # Attempt using the download method from the snippet
                print("   Attempting client.files.download...")
                downloaded_content = client.files.download(file=video.video)
                
                # Check if it returns bytes
                if isinstance(downloaded_content, bytes):
                    print("   Download returned bytes. Saving...")
                    with open(output_path, "wb") as f:
                        f.write(downloaded_content)
                    print("✅ Video saved successfully!")
                else:
                    print(f"   Download returned {type(downloaded_content)}. Trying to interpret...")
                    # If it didn't return bytes, maybe it saved to a default location?
                    
            except Exception as save_err:
                print(f"❌ Failed to save video: {save_err}")
        else:
            print("❌ No video returned in result.")
            if operation.error:
                print(f"   Error: {operation.error}")

    except Exception as e:
        print(f"❌ API Request failed: {e}")

if __name__ == "__main__":
    create_gamebuddies_ad()
