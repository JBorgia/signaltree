import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-signalquest-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="signalquest-page">
      <!-- Cross-link bar -->
      <div class="breadcrumb">
        <a routerLink="/examples/fundamentals" class="breadcrumb__link">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Fundamentals
        </a>
      </div>

      <!-- Page Header -->
      <header class="hero">
        <div class="hero__badge">
          <svg class="hero__badge-icon" fill="currentColor" viewBox="0 0 20 20">
            <path
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
            />
          </svg>
          <span>Full Integration Demo</span>
        </div>
        <h1 class="hero__title">
          <span class="hero__title-main">SignalQuest</span>
          <span class="hero__title-sub">Interactive RPG</span>
        </h1>
        <p class="hero__description">
          Experience SignalTree in action through an interactive RPG demo. This
          comprehensive example combines signals, computed values, entities,
          middleware, time travel, and more — all working together in a cohesive
          application.
        </p>

        <!-- Visual Feature Grid -->
        <div class="feature-showcase">
          <div class="tech-stack">
            <div class="tech-item">
              <div class="tech-icon">📊</div>
              <div class="tech-label">SIGNALS</div>
              <div class="tech-visual">
                <span class="pulse-dot"></span>
                <span class="pulse-dot"></span>
                <span class="pulse-dot"></span>
              </div>
            </div>
            <div class="tech-connector">▶</div>
            <div class="tech-item">
              <div class="tech-icon">🧮</div>
              <div class="tech-label">COMPUTED</div>
              <div class="tech-visual">
                <span class="compute-bar"></span>
                <span class="compute-bar"></span>
              </div>
            </div>
            <div class="tech-connector">▶</div>
            <div class="tech-item">
              <div class="tech-icon">⚡</div>
              <div class="tech-label">EFFECTS</div>
              <div class="tech-visual">
                <span class="lightning"></span>
              </div>
            </div>
            <div class="tech-connector">▶</div>
            <div class="tech-item">
              <div class="tech-icon">🎨</div>
              <div class="tech-label">RENDER</div>
              <div class="tech-visual">
                <span class="render-wave"></span>
              </div>
            </div>
          </div>

          <div class="power-grid">
            <div class="power-cell">
              <div class="power-icon">⚡</div>
              <div class="power-label">BATCHING</div>
              <div class="power-meter">
                <div class="meter-fill" style="width: 85%"></div>
              </div>
            </div>
            <div class="power-cell">
              <div class="power-icon">🧠</div>
              <div class="power-label">MEMOIZATION</div>
              <div class="power-meter">
                <div class="meter-fill" style="width: 92%"></div>
              </div>
            </div>
            <div class="power-cell">
              <div class="power-icon">👥</div>
              <div class="power-label">ENTITIES</div>
              <div class="power-meter">
                <div class="meter-fill" style="width: 78%"></div>
              </div>
            </div>
            <div class="power-cell">
              <div class="power-icon">⏰</div>
              <div class="power-label">TIME TRAVEL</div>
              <div class="power-meter">
                <div class="meter-fill" style="width: 95%"></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- RPG Demo -->
    </div>
  `,
  styles: [
    `
      .signalquest-page {
        min-height: 100vh;
        background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
        padding: 24px 20px;
      }

      .breadcrumb {
        max-width: 1400px;
        margin: 0 auto 24px;

        &__link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          background: rgba(30, 41, 59, 0.6);
          backdrop-filter: blur(10px);
          border: 2px solid #334155;
          border-radius: 10px;
          color: #cbd5e1;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s ease;

          svg {
            width: 18px;
            height: 18px;
          }

          &:hover {
            border-color: #8b5cf6;
            color: white;
            transform: translateX(-4px);
          }
        }
      }

      .hero {
        max-width: 1400px;
        margin: 0 auto 32px;
        padding: 32px;
        background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
        border-radius: 16px;
        border: 2px solid rgba(139, 92, 246, 0.3);
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);

        &__badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(139, 92, 246, 0.2);
          border: 2px solid rgba(139, 92, 246, 0.3);
          border-radius: 10px;
          color: #c4b5fd;
          font-weight: 700;
          font-size: 12px;
          margin-bottom: 20px;

          &-icon {
            width: 16px;
            height: 16px;
          }
        }

        &__title {
          margin: 0 0 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        &__title-main {
          font-size: 48px;
          font-weight: 800;
          background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
          letter-spacing: -1px;
        }

        &__title-sub {
          font-size: 28px;
          font-weight: 600;
          color: #cbd5e1;
          letter-spacing: -0.5px;
        }

        &__description {
          font-size: 16px;
          line-height: 1.6;
          color: #94a3b8;
          max-width: 900px;
          margin: 0;
        }
      }

      .rpg-demo-section {
        max-width: 1400px;
        margin: 0 auto;
      }

      @media (max-width: 768px) {
        .signalquest-page {
          padding: 16px 12px;
        }

        .breadcrumb {
          margin-bottom: 16px;
        }

        .hero {
          padding: 24px 20px;
          margin-bottom: 24px;

          &__title-main {
            font-size: 36px;
          }

          &__title-sub {
            font-size: 22px;
          }

          &__description {
            font-size: 15px;
          }
        }
      }

      /* VISUAL FEATURE SHOWCASE */
      .feature-showcase {
        margin-top: 32px;
      }

      .tech-stack {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 24px;
        padding: 20px;
        background: linear-gradient(
          145deg,
          rgba(30, 41, 59, 0.8),
          rgba(15, 23, 42, 0.8)
        );
        border: 2px solid rgba(139, 92, 246, 0.3);
        border-radius: 12px;
      }

      .tech-item {
        flex: 1;
        text-align: center;
        padding: 16px;
        background: rgba(0, 0, 0, 0.4);
        border: 2px solid rgba(139, 92, 246, 0.4);
        border-radius: 10px;
        transition: all 0.3s ease;

        &:hover {
          transform: translateY(-5px) scale(1.05);
          border-color: #8b5cf6;
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.6);
        }
      }

      .tech-icon {
        font-size: 32px;
        margin-bottom: 8px;
        animation: float 3s ease-in-out infinite;
      }

      @keyframes float {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-10px);
        }
      }

      .tech-label {
        font-size: 11px;
        font-weight: 800;
        color: #8b5cf6;
        letter-spacing: 1px;
        margin-bottom: 12px;
      }

      .tech-visual {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 6px;
        height: 20px;
      }

      .pulse-dot {
        width: 8px;
        height: 8px;
        background: #8b5cf6;
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;

        &:nth-child(2) {
          animation-delay: 0.2s;
        }
        &:nth-child(3) {
          animation-delay: 0.4s;
        }
      }

      @keyframes pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.5);
          opacity: 0.5;
        }
      }

      .compute-bar {
        width: 20px;
        height: 12px;
        background: linear-gradient(90deg, #3b82f6, #8b5cf6);
        border-radius: 2px;
        animation: compute 1s ease-in-out infinite alternate;

        &:nth-child(2) {
          animation-delay: 0.3s;
        }
      }

      @keyframes compute {
        from {
          opacity: 0.3;
          transform: scaleX(0.8);
        }
        to {
          opacity: 1;
          transform: scaleX(1);
        }
      }

      .lightning {
        width: 20px;
        height: 20px;
        background: #f59e0b;
        clip-path: polygon(
          50% 0%,
          61% 35%,
          98% 35%,
          68% 57%,
          79% 91%,
          50% 70%,
          21% 91%,
          32% 57%,
          2% 35%,
          39% 35%
        );
        animation: zap 0.8s ease-in-out infinite;
      }

      @keyframes zap {
        0%,
        100% {
          transform: scale(1);
          filter: brightness(1);
        }
        50% {
          transform: scale(1.3);
          filter: brightness(2);
        }
      }

      .render-wave {
        width: 40px;
        height: 12px;
        background: repeating-linear-gradient(
          90deg,
          #10b981,
          #10b981 4px,
          transparent 4px,
          transparent 8px
        );
        animation: wave 1s linear infinite;
      }

      @keyframes wave {
        from {
          background-position: 0 0;
        }
        to {
          background-position: 40px 0;
        }
      }

      .tech-connector {
        font-size: 24px;
        color: #8b5cf6;
        font-weight: bold;
        animation: flow 1.5s ease-in-out infinite;
      }

      @keyframes flow {
        0%,
        100% {
          opacity: 0.4;
          transform: translateX(0);
        }
        50% {
          opacity: 1;
          transform: translateX(5px);
        }
      }

      .power-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
      }

      .power-cell {
        padding: 16px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid rgba(139, 92, 246, 0.3);
        border-radius: 10px;
        transition: all 0.3s ease;

        &:hover {
          border-color: #8b5cf6;
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(139, 92, 246, 0.4);

          .power-icon {
            transform: rotate(360deg);
          }
        }
      }

      .power-icon {
        font-size: 28px;
        margin-bottom: 8px;
        display: block;
        transition: transform 0.6s ease;
      }

      .power-label {
        font-size: 10px;
        font-weight: 800;
        color: #cbd5e1;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
      }

      .power-meter {
        height: 8px;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid #334155;
        border-radius: 4px;
        overflow: hidden;
      }

      .meter-fill {
        height: 100%;
        background: linear-gradient(90deg, #8b5cf6, #6366f1, #3b82f6);
        border-radius: 4px;
        animation: fillPulse 2s ease-in-out infinite;
        box-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
      }

      @keyframes fillPulse {
        0%,
        100% {
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.8);
        }
        50% {
          box-shadow: 0 0 20px rgba(139, 92, 246, 1);
        }
      }

      @media (max-width: 768px) {
        .tech-stack {
          flex-wrap: wrap;
        }

        .tech-connector {
          display: none;
        }

        .power-grid {
          grid-template-columns: repeat(2, 1fr);
        }

        .battlefield {
          font-size: 9px;
        }
      }
    `,
  ],
})
export class SignalquestPageComponent {}
