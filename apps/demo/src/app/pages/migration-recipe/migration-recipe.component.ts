import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-migration-recipe',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './migration-recipe.component.html',
  styleUrl: './migration-recipe.component.scss',
})
export class MigrationRecipeComponent {}
