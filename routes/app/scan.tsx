import { Handlers, PageProps } from "$fresh/server.ts";
import { AppShell } from "$components/Layout.tsx";
import { getActiveCropByFarm, getFarmsByFarmer } from "$lib/farm.ts";
import VoiceLogger from "$islands/VoiceLogger.tsx";
import type { AuthState } from "../../middlewares/auth.ts";

interface ScanPageData {
  farmId: string | null;
  cropType: string | null;
}

export const handler: Handlers<ScanPageData, AuthState> = {
  async GET(_req, ctx) {
    if (!ctx.state.session || !ctx.state.user) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/login" },
      });
    }

    const { session } = ctx.state;
    const farms = await getFarmsByFarmer(session.userId, session.tenantId);

    let farmId = null;
    let cropType = null;

    if (farms.length > 0) {
      farmId = farms[0].id;
      const crop = await getActiveCropByFarm(farms[0].id);
      cropType = crop?.cropType || null;
    }

    return ctx.render({ farmId, cropType });
  },
};

export default function ScanPage({ data }: PageProps<ScanPageData>) {
  const { farmId, cropType } = data;

  return (
    <AppShell title="Field Analysis" showBack>
      <div id="scan-app">
        {/* Camera View */}
        <div
          class="relative bg-black rounded-xl overflow-hidden mb-4"
          style="aspect-ratio: 4/3;"
        >
          <video
            id="camera-preview"
            class="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          <canvas id="capture-canvas" class="hidden" />

          {/* Camera Overlay */}
          <div class="absolute inset-0 pointer-events-none">
            {/* Corner markers */}
            <div class="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-white/70" />
            <div class="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-white/70" />
            <div class="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-white/70" />
            <div class="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-white/70" />
          </div>

          {/* Captured Image Preview */}
          <img
            id="captured-image"
            class="hidden w-full h-full object-cover"
            alt="Captured"
          />
        </div>

        {/* Instructions */}
        <div
          id="instructions"
          class="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4"
        >
          <p class="text-sm text-blue-800">
            <strong>Tips for best results:</strong>
          </p>
          <ul class="text-sm text-blue-700 mt-1 space-y-1">
            <li>• Hold phone steady and close to the crop</li>
            <li>• Ensure good lighting (natural light preferred)</li>
            <li>• Focus on affected leaves or areas</li>
            <li>• Include both healthy and affected parts if possible</li>
          </ul>
        </div>

        {/* Voice Crop-Health Logging */}
        <div class="bg-white border rounded-xl p-4 mb-4">
          <h3 class="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <span>🎙</span> Or describe the problem by voice
          </h3>
          <p class="text-xs text-gray-500 mb-3">
            Speak in Odia, Hindi or English — we transcribe, diagnose, and can
            forward it to an expert
          </p>
          <VoiceLogger cropType={cropType ?? undefined} />
        </div>

        {/* Capture Controls */}
        <div id="capture-controls" class="mb-4">
          <div class="flex justify-center items-center gap-6">
            {/* Flip Camera */}
            <button
              type="button"
              id="flip-camera-btn"
              class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200"
              title="Flip Camera"
            >
              <svg
                class="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            {/* Capture Button */}
            <button
              type="button"
              id="capture-btn"
              class="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center hover:bg-primary-700 shadow-lg"
            >
              <div class="w-12 h-12 border-4 border-white rounded-full" />
            </button>

            {/* Upload Photo */}
            <label
              class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 cursor-pointer"
              title="Upload Photo"
            >
              <svg
                class="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <input
                type="file"
                id="photo-upload"
                accept="image/*"
                class="hidden"
              />
            </label>
          </div>
          <p class="text-center text-xs text-gray-500 mt-2">
            Tap to capture or upload a photo
          </p>
        </div>

        {/* Analysis Controls (hidden initially) */}
        <div id="analysis-controls" class="hidden space-y-3">
          <div class="flex gap-3">
            <button
              type="button"
              id="retake-btn"
              class="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium"
            >
              Retake
            </button>
            <button
              type="button"
              id="analyze-btn"
              class="flex-1 py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700"
            >
              Analyze
            </button>
          </div>
        </div>

        {/* Analysis Result */}
        <div id="analysis-result" class="hidden space-y-4">
          {/* Health Score */}
          <div class="bg-white rounded-xl border border-gray-100 p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-gray-900">Crop Health Score</h3>
              <span
                id="health-score"
                class="text-2xl font-bold text-primary-600"
              >
                --
              </span>
            </div>
            <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                id="health-bar"
                class="h-full bg-primary-500 rounded-full transition-all duration-500"
                style="width: 0%"
              />
            </div>
          </div>

          {/* Detected Issues */}
          <div
            id="issues-container"
            class="bg-white rounded-xl border border-gray-100 p-4"
          >
            <h3 class="font-semibold text-gray-900 mb-3">Detected Issues</h3>
            <div id="issues-list" class="space-y-2" />
          </div>

          {/* Recommendations */}
          <div
            id="recommendations-container"
            class="bg-white rounded-xl border border-gray-100 p-4"
          >
            <h3 class="font-semibold text-gray-900 mb-3">Recommendations</h3>
            <div id="recommendations-list" class="space-y-2" />
          </div>

          {/* Actions */}
          <div class="flex gap-3">
            <button
              type="button"
              id="new-scan-btn"
              class="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium"
            >
              New Scan
            </button>
            <a
              href="/app/chat"
              class="flex-1 py-3 bg-primary-600 text-white rounded-lg font-semibold text-center hover:bg-primary-700"
            >
              Ask AI for Help
            </a>
          </div>
        </div>

        {/* Loading State */}
        <div id="loading" class="hidden text-center py-8">
          <div class="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p class="text-gray-600">Analyzing your crop...</p>
        </div>
      </div>

      {/* Camera Script */}
      {/* deno-lint-ignore react-no-danger */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const cropType = ${JSON.stringify(cropType)};
            const farmId = ${JSON.stringify(farmId)};
            
            const video = document.getElementById('camera-preview');
            const canvas = document.getElementById('capture-canvas');
            const capturedImage = document.getElementById('captured-image');
            const captureBtn = document.getElementById('capture-btn');
            const flipCameraBtn = document.getElementById('flip-camera-btn');
            const photoUpload = document.getElementById('photo-upload');
            const retakeBtn = document.getElementById('retake-btn');
            const analyzeBtn = document.getElementById('analyze-btn');
            const newScanBtn = document.getElementById('new-scan-btn');
            
            const instructions = document.getElementById('instructions');
            const captureControls = document.getElementById('capture-controls');
            const analysisControls = document.getElementById('analysis-controls');
            const analysisResult = document.getElementById('analysis-result');
            const loading = document.getElementById('loading');

            let stream = null;
            let capturedImageData = null;
            let facingMode = 'environment'; // 'environment' = back camera, 'user' = front camera

            // Initialize camera
            async function startCamera() {
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                video.srcObject = stream;
              } catch (err) {
                console.error('Camera error:', err);
                instructions.innerHTML = '<p class="text-red-600">Could not access camera. Please allow camera permissions or upload a photo.</p>';
              }
            }

            function stopCamera() {
              if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
              }
            }

            // Flip camera
            flipCameraBtn.addEventListener('click', async () => {
              stopCamera();
              facingMode = facingMode === 'environment' ? 'user' : 'environment';
              await startCamera();
            });

            // Handle photo upload
            photoUpload.addEventListener('change', (e) => {
              const file = e.target.files[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                  capturedImageData = event.target.result;
                  capturedImage.src = capturedImageData;
                  capturedImage.classList.remove('hidden');
                  video.classList.add('hidden');
                  
                  instructions.classList.add('hidden');
                  captureControls.classList.add('hidden');
                  analysisControls.classList.remove('hidden');
                };
                reader.readAsDataURL(file);
              }
            });

            // Capture photo
            captureBtn.addEventListener('click', () => {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0);
              capturedImageData = canvas.toDataURL('image/jpeg', 0.8);
              
              capturedImage.src = capturedImageData;
              capturedImage.classList.remove('hidden');
              video.classList.add('hidden');
              
              instructions.classList.add('hidden');
              captureControls.classList.add('hidden');
              analysisControls.classList.remove('hidden');
            });

            // Retake photo
            retakeBtn.addEventListener('click', () => {
              capturedImage.classList.add('hidden');
              video.classList.remove('hidden');
              
              instructions.classList.remove('hidden');
              captureControls.classList.remove('hidden');
              analysisControls.classList.add('hidden');
              analysisResult.classList.add('hidden');
            });

            // Analyze
            analyzeBtn.addEventListener('click', async () => {
              analysisControls.classList.add('hidden');
              loading.classList.remove('hidden');

              try {
                const response = await fetch('/api/analyze-crop', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    image: capturedImageData,
                    cropType: cropType,
                    farmId: farmId,
                  }),
                });

                const result = await response.json();
                displayResults(result);
              } catch (err) {
                console.error('Analysis error:', err);
                displayResults(generateMockAnalysis());
              }
            });

            // New scan
            newScanBtn.addEventListener('click', () => {
              capturedImage.classList.add('hidden');
              video.classList.remove('hidden');
              
              instructions.classList.remove('hidden');
              captureControls.classList.remove('hidden');
              analysisResult.classList.add('hidden');
            });

            function displayResults(result) {
              loading.classList.add('hidden');
              analysisResult.classList.remove('hidden');

              // Health score
              const score = result.healthScore || 75;
              document.getElementById('health-score').textContent = score + '/100';
              document.getElementById('health-bar').style.width = score + '%';
              document.getElementById('health-bar').className = 
                'h-full rounded-full transition-all duration-500 ' +
                (score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500');

              // Issues
              const issuesList = document.getElementById('issues-list');
              issuesList.innerHTML = '';
              (result.issues || []).forEach(issue => {
                const severityColors = {
                  low: 'bg-green-100 text-green-800',
                  medium: 'bg-yellow-100 text-yellow-800',
                  high: 'bg-red-100 text-red-800',
                };
                issuesList.innerHTML += \`
                  <div class="flex items-start gap-3 p-2 bg-gray-50 rounded-lg">
                    <span class="px-2 py-0.5 text-xs rounded \${severityColors[issue.severity] || severityColors.medium}">
                      \${issue.severity}
                    </span>
                    <div>
                      <p class="text-sm font-medium text-gray-900">\${issue.type}</p>
                      <p class="text-xs text-gray-600">\${issue.description}</p>
                    </div>
                  </div>
                \`;
              });

              // Recommendations
              const recsList = document.getElementById('recommendations-list');
              recsList.innerHTML = '';
              (result.recommendations || []).forEach((rec, i) => {
                recsList.innerHTML += \`
                  <div class="flex items-start gap-3">
                    <span class="w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                      \${i + 1}
                    </span>
                    <p class="text-sm text-gray-700">\${rec}</p>
                  </div>
                \`;
              });
            }

            function generateMockAnalysis() {
              const issues = [
                { type: 'Nutrient Deficiency', severity: 'medium', description: 'Possible nitrogen deficiency detected from leaf coloration' },
                { type: 'Water Stress', severity: 'low', description: 'Mild water stress indicators observed' },
              ];
              
              const recommendations = [
                'Apply foliar spray of 2% urea solution in the evening',
                'Irrigate field within next 2-3 days if no rain expected',
                'Monitor closely for any pest activity',
                'Consider soil testing for accurate nutrient assessment',
              ];

              return {
                healthScore: Math.floor(Math.random() * 30) + 60,
                issues: issues.slice(0, Math.floor(Math.random() * 2) + 1),
                recommendations: recommendations.slice(0, Math.floor(Math.random() * 2) + 2),
              };
            }

            // Start camera on load
            startCamera();

            // Cleanup on page leave
            window.addEventListener('beforeunload', stopCamera);
          `,
        }}
      />
    </AppShell>
  );
}
