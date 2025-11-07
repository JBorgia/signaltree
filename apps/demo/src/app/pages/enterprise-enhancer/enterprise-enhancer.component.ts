import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-enterprise-enhancer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './enterprise-enhancer.component.html',
  styleUrls: ['./enterprise-enhancer.component.scss'],
})
export class EnterpriseEnhancerComponent {
  // Small demo page explaining the Enterprise enhancer and configuration
  public description =
    'Enterprise enhancer bundles time-travel, serialization, and audit/telemetry features into a single, opt-in configuration for large apps.';

  public example = `
import { signalTree } from '@signaltree/core';
import { withTimeTravel, withSerialization, withMiddleware } from '@signaltree/core';

const tree = signalTree(state).with(withTimeTravel(), withSerialization(), withMiddleware());
`;
}
